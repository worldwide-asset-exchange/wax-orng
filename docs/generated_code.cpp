#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/crypto.hpp>
#include <eosio/system.hpp>

using namespace eosio;

/*--------------------------------------------------*/
/*  Constants                                       */
/*--------------------------------------------------*/
static constexpr symbol WAX{ "WAX", 4 };
static constexpr name   TOKEN{ "eosio.token"_n };
static constexpr name   GOV  { "orng.gov"_n };          // BP-multisig account

/*--------------------------------------------------*/
/*  Config singleton                                */
/*--------------------------------------------------*/
struct [[eosio::table, eosio::contract("orng.wax")]] config {
    asset   fee_per_call   { 500, WAX };   // 0.05 WAX
    uint8_t strikes_max    = 3;
    uint8_t k_calls_per_wax= 3;
    uint8_t active_ver     = 0;
    bool    paused_all     = false;
    bool    paused_req     = false;
};
using config_singleton = singleton<"config"_n, config>;

/*--------------------------------------------------*/
/*  Key / oracle / ban tables                       */
/*--------------------------------------------------*/
struct [[eosio::table]] pubkey {
    uint8_t       ver;
    checksum256   modulus;
    uint32_t      exponent;
    bool          retired = false;
    uint64_t primary_key() const { return ver; }
};
using pkey_table = multi_index<"pubkeys"_n, pubkey>;

struct [[eosio::table]] orinfo {
    name    oracle;
    uint8_t strikes   = 0;
    bool    suspended = false;
    uint64_t primary_key() const { return oracle.value; }
};
using oracles_table = multi_index<"oracles"_n, orinfo>;

struct [[eosio::table]] ban { name dapp; uint64_t primary_key()const{return dapp.value;}; };
using ban_table = multi_index<"banlist"_n, ban>;

/*--------------------------------------------------*/
/*  Per-dApp economic state                         */
/*--------------------------------------------------*/
struct [[eosio::table]] acctstate {
    name          dapp;
    asset         stake        {0,WAX};
    uint32_t      credits      = 0;
    asset         fee_balance  {0,WAX};
    uint64_t      last_nonce   = 0;
    time_point_sec last_update;
    uint64_t primary_key() const { return dapp.value; }
};
using acct_table = multi_index<"acctstate"_n, acctstate>;

/*--------------------------------------------------*/
/*  Treasury & unpaid balances                      */
/*--------------------------------------------------*/
struct [[eosio::table]] treasury { asset pool_balance{0,WAX}; };
using treas_singleton = singleton<"treasury"_n, treasury>;

struct [[eosio::table]] balrow {
    name  oracle;  asset unpaid{0,WAX};
    uint64_t primary_key()const{return oracle.value;}
};
using bal_table = multi_index<"balances"_n, balrow>;

/*--------------------------------------------------*/
/*  Error log (per dApp)                            */
/*--------------------------------------------------*/
struct [[eosio::table]] errrow {
    uint64_t id; uint64_t assoc; std::string msg;
    time_point_sec logged;
    uint64_t primary_key()const{return id;}
};
using err_table = multi_index<"errorlog"_n, errrow>;

/*--------------------------------------------------*/
/*  RNG request                                     */
/*--------------------------------------------------*/
struct part { uint8_t idx; checksum256 sig_i; };

struct [[eosio::table]] request {
    uint64_t        id;
    name            dapp;
    checksum256     seed;
    uint8_t         ver;
    uint64_t        nonce;
    std::vector<part> parts;     // optional transparency
    uint64_t primary_key()const{return id;}
};
using req_table = multi_index<"reqs"_n, request>;

/*--------------------------------------------------*/
/*  Helpers                                         */
/*--------------------------------------------------*/
static checksum256 make_msg(checksum256 seed,name d,uint64_t n){
    auto sb=seed.extract_as_byte_array();
    std::vector<char> buf(sb.begin(),sb.end());
    uint64_t v=d.value; for(int i=0;i<8;++i) buf.push_back((v>>(i*8))&0xff);
    for(int i=0;i<8;++i) buf.push_back((n>>(i*8))&0xff);
    return sha256(buf.data(),buf.size());
}

/*--------------------------------------------------*/
/*  Contract class                                  */
/*--------------------------------------------------*/
class [[eosio::contract("orng.wax")]] orng : public contract {
public:
    using contract::contract;

    /* economic */
    [[eosio::action]] void stake(name,asset);
    [[eosio::action]] void unstake(name,asset);
    [[eosio::action]] void deposit(name,asset);

    /* RNG */
    [[eosio::action]] void requestrand(name,checksum256,uint64_t); // assoc_id arg
    [[eosio::action]] void submitpart(uint64_t,uint8_t,uint8_t,checksum256);
    [[eosio::action]] void setrand(uint64_t,uint8_t,std::string);

    /* misc */
    [[eosio::action]] void dapperror(name,uint64_t,std::string);
    [[eosio::action]] void claim(name);

    /* governance */
    [[eosio::action]] void ban(name);   [[eosio::action]] void unban(name);
    [[eosio::action]] void pause(bool); [[eosio::action]] void pauserequest(bool);
    [[eosio::action]] void setpubkey(uint8_t,checksum256,uint32_t);
    [[eosio::action]] void setoracles(std::vector<name>);
    [[eosio::action]] void resetsuspen(name);
    [[eosio::action]] void setconfig(asset,uint8_t,uint8_t);

private:
    /* helpers */
    config _conf()const{ return config_singleton(get_self(),get_self().value).get(); }
    void   _ensure_not_paused()const{ check(!_conf().paused_all,"paused"); }
    void   _ensure_req()const{ const auto& c=_conf(); check(!c.paused_all&&!c.paused_req,"req paused"); }
    void   _refill(acct_table::iterator,const config&);
    void   _reward_oracles(asset);
};

/*--------------------------------------------------*/
/*  Implementation                                  */
/*--------------------------------------------------*/
void orng::_refill(acct_table::iterator it,const config& c){
    uint32_t maxc=it->stake.amount*c.k_calls_per_wax;
    uint32_t rate=maxc/3600;
    uint32_t dt=(current_time_point()-it->last_update).to_seconds();
    uint32_t add=rate*dt;
    acct_table at(get_self(),get_self().value);
    at.modify(it,same_payer,[&](auto&r){
        r.credits=std::min(r.credits+add,maxc);
        r.last_update=current_time_point();
    });
}

/* stake / unstake / deposit */
void orng::stake(name d,asset q){
    _ensure_not_paused(); require_auth(d);
    check(q.symbol==WAX&&q.amount>0,"bad");
    acct_table at(get_self(),get_self().value);
    auto it=at.find(d.value);
    if(it==at.end()) at.emplace(d,[&](auto&r){r.dapp=d;r.stake=q;r.last_update=current_time_point();});
    else{ _refill(it,_conf()); at.modify(it,same_payer,[&](auto&r){r.stake+=q;}); }
}
void orng::unstake(name d,asset q){
    _ensure_not_paused(); require_auth(d);
    acct_table at(get_self(),get_self().value);
    auto it=at.require_find(d.value,"?"); _refill(it,_conf());
    check(it->stake>=q,"exceed");
    at.modify(it,same_payer,[&](auto&r){ r.stake-=q; });
    action{ {get_self(),"active"_n},TOKEN,"transfer"_n,
            std::make_tuple(get_self(),d,q,string("unstake")) }.send();
}
void orng::deposit(name d,asset q){
    _ensure_not_paused(); require_auth(d);
    check(q.symbol==WAX&&q.amount>0,"bad");
    acct_table at(get_self(),get_self().value);
    auto it=at.find(d.value);
    if(it==at.end()) at.emplace(d,[&](auto&r){r.dapp=d;r.fee_balance=q;r.last_update=current_time_point();});
    else at.modify(it,same_payer,[&](auto&r){r.fee_balance+=q;});
}

/* requestrand */
void orng::requestrand(name d,checksum256 seed,uint64_t assoc){
    _ensure_req(); require_auth(d);
    ban_table bt(get_self(),get_self().value); check(bt.find(d.value)==bt.end(),"banned");

    config cfg=_conf();
    acct_table at(get_self(),get_self().value);
    auto it=at.require_find(d.value,"stake first"); _refill(it,cfg);

    if(it->credits==0){
        check(it->fee_balance>=cfg.fee_per_call,"need fee");
        at.modify(it,same_payer,[&](auto&r){ r.fee_balance-=cfg.fee_per_call;});
        _reward_oracles(cfg.fee_per_call);
    } else at.modify(it,same_payer,[&](auto&r){ r.credits--; });

    uint64_t nonce=++(it->last_nonce);
    at.modify(it,same_payer,[&](auto&r){ r.last_nonce=nonce; });

    req_table rt(get_self(),get_self().value);
    rt.emplace(d,[&](auto&r){
        r.id=rt.available_primary_key(); r.dapp=d; r.seed=seed;
        r.ver=cfg.active_ver; r.nonce=nonce; r.parts.clear();
    });

    /* store assoc_id in errorlog row 0 for caller reference (optional) */
    err_table et(get_self(),d.value);
    if(et.empty()) et.emplace(d,[&](auto&r){r.id=0;r.assoc=assoc;r.msg="last_assoc";});
    else et.modify(et.begin(),same_payer,[&](auto&r){r.assoc=assoc;});
}

/* submitpart (store only) */
void orng::submitpart(uint64_t id,uint8_t ver,uint8_t idx,checksum256 sig_i){
    _ensure_not_paused();
    oracles_table ot(get_self(),get_self().value);
    auto oit=ot.require_find(get_sender().value,"?"); check(!oit->suspended,"susp");
    req_table rt(get_self(),get_self().value);
    auto rit=rt.require_find(id,"id?"); check(rit->ver==ver,"ver");
    for(auto&p:rit->parts) check(p.idx!=idx,"dup");
    rt.modify(rit,same_payer,[&](auto&r){ r.parts.push_back({idx,sig_i});});
}

/* setrand - completes request */
void orng::setrand(uint64_t id,uint8_t ver,std::string sig){
    _ensure_not_paused(); name oracle=get_sender();
    check(sig.size()==384,"len");

    req_table rt(get_self(),get_self().value);
    auto rit=rt.require_find(id,"?"); check(rit->ver==ver,"ver");

    pkey_table pk(get_self(),get_self().value);
    auto pit=pk.require_find(ver,"key?");

    checksum256 msg=make_msg(rit->seed,rit->dapp,rit->nonce);

    bool ok=verify_rsa_sha256_sig(sig.data(),384,
                                  msg.data(),32,
                                  reinterpret_cast<char*>(&pit->exponent),4,
                                  pit->modulus.extract_as_byte_array().data(),384);
    if(!ok){
        oracles_table ot(get_self(),get_self().value);
        auto oit=ot.require_find(oracle.value,"?"); ot.modify(oit,same_payer,[&](auto&r){
            if(++r.strikes>=_conf().strikes_max) r.suspended=true;});
        return;
    }
    checksum256 rnd=sha256(sig.data(),384);
    action{ {get_self(),"active"_n}, rit->dapp,"receiverand"_n,
            std::make_tuple(rnd) }.send();

    _reward_oracles(_conf().fee_per_call);
    rt.erase(rit);
}

/* reward split */
void orng::_reward_oracles(asset qty){
    oracles_table ot(get_self(),get_self().value);
    if(ot.empty()) return;
    asset each{ qty.amount/static_cast<int64_t>(ot.size()), WAX };
    bal_table bt(get_self(),get_self().value);
    for(auto& o:ot){
        auto it=bt.find(o.oracle.value);
        if(it==bt.end()) bt.emplace(get_self(),[&](auto&r){ r.oracle=o.oracle;r.unpaid=each;});
        else bt.modify(it,same_payer,[&](auto&r){ r.unpaid+=each;});
    }
}
void orng::claim(name o){
    _ensure_not_paused(); require_auth(o);
    bal_table bt(get_self(),get_self().value);
    auto it=bt.require_find(o.value,"none"); check(it->unpaid.amount>0,"zero");
    asset pay=it->unpaid; bt.modify(it,same_payer,[&](auto&r){ r.unpaid.amount=0;});
    action{ {get_self(),"active"_n},TOKEN,"transfer"_n,
            std::make_tuple(get_self(),o,pay,string("rng reward")) }.send();
}

/* dapperror */
void orng::dapperror(name d,uint64_t assoc,std::string m){
    require_auth(permission_level{d,"ornglog"_n});
    err_table et(get_self(),d.value);
    while(et.size()>19) et.erase(et.begin());
    et.emplace(d,[&](auto&r){
        r.id=et.available_primary_key(); r.assoc=assoc; r.msg=m; r.logged=current_time_point();
    });
}

/* governance small ones */
void orng::ban(name d){ require_auth(GOV);
    ban_table bt(get_self(),get_self().value); check(bt.find(d.value)==bt.end(),"dup");
    bt.emplace(get_self(),[&](auto&r){ r.dapp=d;});
}
void orng::unban(name d){ require_auth(GOV);
    ban_table bt(get_self(),get_self().value);
    auto it=bt.require_find(d.value,"?"); bt.erase(it);
}
void orng::pause(bool p){ require_auth(GOV); auto c=_conf(); c.paused_all=p;
    config_singleton(get_self(),get_self().value).set(c,get_self()); }
void orng::pauserequest(bool p){ require_auth(GOV); auto c=_conf(); c.paused_req=p;
    config_singleton(get_self(),get_self().value).set(c,get_self()); }

void orng::setconfig(asset f,uint8_t sm,uint8_t k){
    require_auth(GOV); check(f.symbol==WAX,"sym");
    auto c=_conf(); c.fee_per_call=f; c.strikes_max=sm; c.k_calls_per_wax=k;
    config_singleton(get_self(),get_self().value).set(c,get_self());
}
void orng::setpubkey(uint8_t ver,checksum256 mod,uint32_t exp){
    require_auth(GOV); pkey_table pk(get_self(),get_self().value);
    pk.emplace(get_self(),[&](auto&r){ r.ver=ver;r.modulus=mod;r.exponent=exp;});
    auto c=_conf(); c.active_ver=ver;
    config_singleton(get_self(),get_self().value).set(c,get_self());
}
void orng::setoracles(std::vector<name> list){
    require_auth(GOV); oracles_table ot(get_self(),get_self().value);
    while(!ot.empty()) ot.erase(ot.begin());
    for(auto n:list) ot.emplace(get_self(),[&](auto&r){ r.oracle=n;});
}
void orng::resetsuspen(name o){ require_auth(GOV);
    oracles_table ot(get_self(),get_self().value);
    auto it=ot.require_find(o.value,"?"); ot.modify(it,same_payer,[&](auto&r){ r.strikes=0;r.suspended=false;});
}

/*--------------------------------------------------*/
/*  Dispatcher                                      */
/*--------------------------------------------------*/
extern "C" [[clang::export_name("apply")]]
void apply(uint64_t receiver,uint64_t code,uint64_t action){
    if(code==TOKEN.value && action=="transfer"_n.value) return;
    if(code==receiver){
        switch(action){
            EOSIO_DISPATCH_HELPER(orng,
             (stake)(unstake)(deposit)(requestrand)(submitpart)(setrand)
             (dapperror)(claim)(ban)(unban)(pause)(pauserequest)
             (setpubkey)(setoracles)(resetsuspen)(setconfig))
        }
    }
}

