## **✨ \-1 Quick Explainer**

We are upgrading the orng.wax system to make it decentralized yet efficient proportional to the effort needed to produce random values

| Aspect | Current WAX RNG (v1) | New RNG (v3.0-rc2) | Why it’s better |
| ----- | ----- | ----- | ----- |
| **Key custody** | One oracle holds the full RSA private key. | Key is split 2-of-3 with Shamir; nobody ever sees the whole secret. | Removes single point of failure / bribery target. |
| **Request flow** | dApp → `requestrand` → oracle signs → `setrand`. | dApp → `requestrand` → oracles sign in parallel → any oracle posts `setrand`. | Same sub-second latency, and smooth UX. |
| **On-chain CPU** | Verify **1** RSA sig *per request* (good) but bursts when queue flushes. | Still **1** RSA verify per request, but calls come in evenly—no burst. | Predictable CPU, easier to size for BPs. |
| **Sybil / spam defence** | Hard-coded “max 100 jobs” caps; bandwidth-payer hack. | **Stake-meter bucket** (free credits per WAX) \+ **0.05 WAX fee** when empty. | Economic throttle replaces arbitrary caps; simpler dev experience. |
| **Oracle accountability** | If oracle submits bad sig ⇒ contract fails; manual audit. | Automatic **strike-and-suspend** after 3 bad sigs; rewards stop. | Built-in, measurable deterrent. |
| **Governance** | Auto-rotates key every N jobs (opaque). | BP multisig controls `setpubkey`, `setoracles`, `ban`, `pause`. | Transparent, one-click emergency rotation. |
| **Scalability** | Single oracle; performance tied to one machine. | Drop-in upgrade path to *N-of-M* shares and future VRF. | Easy to add more signers or switch to BLS/VRF later. |

## **✨ 0 Overview & Philosophy**

`orng.wax` is the **official randomness hub for WAX dApps.**

* One on‑chain contract coordinates a small committee of off‑chain oracles.

* A dApp makes a `requestrand(seed)` call and—within \~1 s—receives a deterministic yet **unpredictable** 256‑bit value via `receiverand`.

* Security is provided by a **2-of-3 threshold-RSA** signer set: as long as *one* oracle in the 3‑member pool is honest, the result cannot be biased or predicted in advance. This signing set can easily be increased to **any M of N** configuration as required.

---

## **🔐 1 Crypto Core (what actually gets signed)**

| Element | Purpose | Value / Formula |
| ----- | ----- | ----- |
| **Threshold** | How many oracles must cooperate | **2 of 3** (M \= 2, N \= 3\) |
| **Seed** | Entropy from dApp / user | 256‑bit blob passed in `requestrand` |
| **Nonce** | Prevents seed replay | uint64 per‑dApp, auto‑incremented by contract |
| **Message** | Input to RSA | `sha256( seed ‖ dapp_name ‖ nonce )` |
| **Flow** | Order of operations | 3 oracles → 2 partial sigs on‑chain → any oracle combines → `setrand() ->` contract verifies → hashes σ → `receiverand(random)` |

*Because we **don’t wait for irreversibility** (LIB), the whole round trip is sub‑second, suitable for gaming UIs.*

---

## **🗄️ 2 High-level Flow**

```
requestrand(seed)          // dApp → contract
    ├─ credit check (stake bucket or fee tab)
    └─ store {seed, nonce, ver}  ➜ req_id

oracles
    ├─ sign seed with share_i  → σᵢ          (optional: submitpart)
    └─ aggregate any 2 shares  → σ           (off-chain)
        └─ setrand(req_id, ver, σ)           // finishes request

contract (setrand)
    ├─ RSA-verify σ ; strike sender if bad
    ├─ hash σ  → rnd
    └─ inline   receiverand(rnd)  back to dApp


```

If multiple `setrand` calls race, **first valid signature wins**; others fail because the request row has been erased.

## ---

## **🗄️ 3 Persistent Tables & Why They Exist**

| Table | Key | Fields | scope | Why |
| ----- | ----- | ----- | ----- | ----- |
| `pubkeys` | ver | modulus, exponent… | orng.wax | Store current \+ old RSA public keys for grace‑period verification. |
| `oracles` | oracle | strikes, suspended | orng.wax | Track bad‑partial strikes; gate submissions. |
|  |  |  |  |  |
| `dappstate` | dapp | stake, credits, fee\_balance, last\_update, last\_nonce | orng.wax | All per‑dApp economics in one row. |
| `balances` | oracle | unpaid\_rewards | orng.wax | Pull‑claim model reduces tx spam. |
| `treasury` | — | pool\_balance | orng.wax | Pre‑funded inflation pool—can’t overspend. |
| `config` | — | **fee\_per\_call=0.05 WAX, strikes\_max=3, k\_calls\_per\_wax=3, active\_ver, pause** | **orng.wax** | Runtime‑tunable constants (via BP msig). |
| `reqs` | id | **seed, assoc\_id, nonce, ver, optional `parts[]`** | **orng.wax** | Holds the current rng requests in process. Freed once completed or canceled |
| `banlist` | dapp |  | **orng.wax** | Ban malicious dapps |
| `errorlog` | id |  | **dapp** | 20-row rolling buffer of `dapperror` messages |

---

## **⚙️ 4 Action Quick List**

| Action | Who | Short description |
| ----- | ----- | ----- |
| `reguser(user, dapp)` | User | **REQUIRED FIRST** - Register user for dApp; user pays RAM (~300 bytes). One-time per user-dApp pair. |
| `requestrand(assoc_id, seed, caller)` | dApp | ➊ refill credits ➝ ➋ debit credit *else* fee balance ➝ ➌ create request row. NOTE: assoc\_id is for the benefit of the caller for re-associating the request in their system. **Requires prior registration.** |
| `submitpart(req, ver, idx, sig_i)` | Oracle | Rejected if oracle is suspended; stores partial. |
|  |  |  |
| `deposit(dapp, qty)` | User | `transfer + deposit` funds the *fee tab* (`balance_fee`). This will likely just be a transfer with a specific memo. **Requires prior registration.** |
| `stake/unstake` | User | Lock / free WAX for free‑tier credits. **Requires prior registration.** |
| `claim()` | Oracle | Withdraw accumulated per‑combine rewards. |
| Governance | BP msig | `setconfig`, `setpubkey`, `setoracles`, `resetsuspen`, `retirekey`. |

---

## **🛡️ 5 Strike‑and‑Suspend (replaces bond) For later Version that supports on chain partial combining**

* **Bad partial** → increment `strikes`.

* On reaching **strikes\_max (3)** → `suspended = true`.

* Suspended oracle’s future `submitpart` rejected; BPs must `resetsuspen` or rotate a new key.  
   *Lost income* is the incentive to stay honest.

---

## **💰 6 Economics**

| Feature | How it works |
| ----- | ----- |
| **Registration** | **REQUIRED FIRST** - Users must call `reguser(user, dapp)` before staking/depositing. User pays RAM (~300 bytes ≈ 0.03 WAX). One-time per user-dApp pair. Prevents RAM exploitation attacks. |
| **Free tier** | Credits bucket \= `dApp stake × k_calls_per_wax` (3); refills linearly over 1 h. |
| **Paid tier** | When dApp credits \= 0 ➝ contract debits `balance_fee` **0.05 WAX** (configurable) per call. |
| **Funding the tab** | User does `transfer + [dapp] memo`; balance tracks in `acctstate`. **Requires prior registration.** |
| **Treasury subsidy** | BPs pre‑fill `treasury.pool_balance`; contract pays oracles 0.05 WAX/combine while pool \> 0\. |
| **Rewards** | Added to `balances[oracle]`; oracle calls `claim()` at will. As requests are received, the 0.05 WAX drawn from treasury or paid request is split by the number of oracles (3) and added to that oracle's balance.  |
| **No bond** | Simpler; misbehaviour punished by suspension \+ lost revenue. |

---

**🔑 7 Oracle life-cycle**

1. **Key ceremony (dealer split, m=2, n=3)** → share files.

2. Oracle daemon watches `reqs` table, signs seed, coordinates aggregation:

   * v 0:  posts its own partial via `submitpart.`Waits for second partial on-chain, creates signature,  posts via `setrand`.

   * future v 2: gossip partials to other oracles off-chain. Submit final sig via setrand

3. Daemon accrues rewards; claims with `claim()` periodically.

4. If three invalid submissions occur, oracle is **suspended** until BP msig clears it or rotates signer set.

---

**🔑 8 Governance Actions**

| Action | Auth | Function |
| ----- | ----- | ----- |
| `setpubkey(ver, PK)` | BP msig | Major key rotation (new shares & modulus) |
| `setoracles([names])` | BP msig | Update signer list |
| `setconfig(fee, strikes, k, defaultErrorQueueSize)` | BP msig | Tune economics |
| `ban / unban` | BP msig | Add/remove a dApp from ban list |
| `pause / pauserequest` | BP msig | Full or request-only halt |
| `strike/suspend/resetsuspen(oracle)` | BP msig | Suspend/Clear strikes after incident |

All other public actions require normal auth (`dApp`, `oracle`, etc.).  
---

## **🔑 9 Key Generation & Rotation**

| Step | Notes |
| ----- | ----- |
| **Major rotation only**: any ≥ 2 signer change ⇒ new modulus `N₂`. |  |
| New signer set runs DKG ➝ produces `(N₂,e)` \+ 3 shares. |  |
| BP multisig executes `setpubkey(ver+1, PK₂)` \+ updates `oracles` table. |  |
| Old key kept 24 h (grace), then `retirekey`. |  |

---

**🏗️ 10 Pause & Ban Behaviour**

| Switch | Effect |
| ----- | ----- |
| `paused_all = true` | Reject *all* public actions except governance. |
| `paused_req = true` | Only `requestrand` rejected; outstanding requests can finish. |
| Ban list | `requestrand` from banned dApp is silently ignored. |

---

## **🏗️ 11 Error-log micro-service**

## Each dApp may receive `dapperror(msg)` when the attempt to `setrand()` them throws an error. The thrown error will be logged

## Contract stores up to 20 recent messages in `errorlog` scoped to the dApp for support diagnostics.

## 

## ---

## **🏗️ 12 Parameter Defaults**

| Parameter | Default | Explanation |
| ----- | ----- | ----- |
| `fee_per_call` | **0.05 WAX** | Pay‑tier cost when credits exhausted. |
| `strikes_max` | **3** | Three bad partials ⇒ suspension. |
| `k_calls_per_wax` | **3** | One WAX staked unlocks 3 free calls/hour. |

Governance can tweak via `setconfig`.

## ---

## **📜 13 Oracle-Set Selection & Rotation Governance**

| Goal | Keep the signer committee small (low latency) and accountable, while allowing the ecosystem to swap members quickly when trust or uptime changes. |
| :---: | :---: |

#### **13.1 Nomination & Approval flow**

1. **Call for nominees** • BPs (or a governance portal) publish a shortlist of candidate nodes—BP entities themselves or third-party operators.

2. **Due-diligence period** • Community reviews uptime stats, public keys, KYC, legal entity, insurance.

3. **Multisig proposal** • Any active BP may launch a `setoracles([name…])` \+ matching `setpubkey(new_ver, PK)` transaction.

4. **BP approval** • ≥ 15/21 active BPs sign the msig within a 48-h window.

5. **Activation** • New public key \+ oracle list go live immediately; old key enters 24-h grace period then `retirekey`.

*One proposal, one on-chain commit, zero downtime.*

#### **13.2 Eligibility rules (stored off-chain for now)**

| Criterion | Minimum |
| ----- | ----- |
| **Hardware** | Bare-metal or dedicated VM in Tier-3+ DC; redundant power/network. |
| **Latency to WAX** | ≤ 250 ms p2p round-trip to any BP endpoint. |
| **Public identity** | Legal entity & signer PGP key posted. |
| **24/7 ops** | PagerDuty or similar; \< 0.1 % missed responses per month. |
| **Security audit** | Annual pen-test report made public within 30 days. |

*A JSON “oracle registry” repo records evidence for transparency.*

#### **12.3 Regular rotation cadence**

| Event | Action |
| ----- | ----- |
| **Scheduled review** | Every 6 months BPs open a 1-week application window; at least one slot must be put up for re-bid (“musical chairs”). |
| **Strike ≥ `strikes_max`** | If BP council deems behaviour malicious, they push an *emergency* `setoracles` \+ new key with the offender removed. |
| **Voluntary exit** | Oracle submits PDF resignation, BPs run same msig flow to add a replacement and roll a fresh key. |

#### **13.4 Key-rotation impact**

* **Minor update (\< M members leave)** → optional *reshare* phase off-chain (same PK).

* **Major update (≥ M leave)** → *major rotation*: new RSA modulus; contract treats it as a brand-new key version.

The ceremony script auto-generates the Shamir shares and e-mails encrypted blobs to the new operators.

#### **13.5 Future: Possible DAO-level voting**

Long-term, oracle membership could be elected directly by stakers via a light-weight DAO poll smart-contract that produces the `setoracles` msig automatically; the current BP-driven flow is a stepping-stone.

---

## **🛡️ 14 DDoS & Abuse Mitigation**

WAX contracts are free‐to‐call at the protocol layer, so `orng.wax` relies on **economic and governance levers** to deter spam and denial-of-service rather than gas pricing.

| Potential abuse | Why it’s unattractive | Built-in countermeasures |
| ----- | ----- | ----- |
| **Free-tier spamming** (rapid `requestrand` from many accounts) | • Each account must **stake WAX** to earn free credits. • Credits refill slowly (3 calls / WAX / h). • Stake is locked 72 h, visible on-chain, and slashable. | 1\. Per-dApp credit bucket. 2\. BP can `ban()` Sybil contracts. 3\. Suspension of oracles never triggered because contract still verifies quickly. |
| **Paid-fee self-spam** (attacker pays 0.05 WAX to earn same reward) | Fee is **exactly** the total reward split among all 3 oracles, so attacker earns ≤ ⅓ of what they spend, while burning CPU/NET. | Economic zero-gain; still visible as volume spike. |
| **Treasury-drain attempt** (stake free credits to empty subsidy pool) | To burn 1 WAX from pool you must lock ≈1 WAX for an hour and share reward with peers → negative ROI. | 1\. Pool top-up is one multisig transfer. 2\. Optional hard floor can require fee once pool \< X. 3\. Governance can slash stake when `ban()` is invoked. |
| **Oracle insider floods bad σ** | Each failed `setrand` immediately **strikes** sender; 3 strikes ⇒ suspension ⇒ loss of future income. | Strike-and-suspend \+ visible mis-behaviour. |
| **Classic network DDoS** (HTTP/RPC) | Does not change on-chain tx rate; nodes already rate-limit p2p & API. | Handled at infra level by BPs / API gateways. |

#### **14.1 Incentive alignment quick math**

*Stake drain:*

`lock  90  WAX  →  270  free calls / hr`  
`reward = 270 × 0.05 = 13.5 WAX / hr  (split 3 ways)`  
`attacker’s share ≈ 4.5 WAX / hr  ≪ opportunity cost + detectable`

*Paid-fee loop:*

`pay 0.05 WAX  → contract rewards 0.05 WAX total`  
`attacker oracle gets ≤ 0.016 WAX  → guaranteed loss`

#### **14.2 Governance safety valves (one-liners)**

`// (a) Hard floor – require fee if pool low`  
`check(pool_balance.amount > 10*fee_per_call || paid_this_call,`  
      `"treasury empty: attach fee");`

`// (b) Daily outflow cap`  
`if (today_out > daily_cap)  check(paid_this_call, "subsidy exhausted");`

BPs can activate these patches via hot-fix if metrics show abuse.

---

## **📋 15 Upgrade path**

| Target | How |
| ----- | ----- |
| **Off-chain partial gossip** | Oracles gossip partials to one another then post directly to `setrand`. |
| **Full DKG** | Replace dealer split with distributed key-gen; `pubkeys` table untouched. |
|  |  |

---

## **📋 16 Implementation Checklist**

1. **Code**

   * Merge `acctstate` table.

   * Add `deposit`, fee‑balance debit path.

   * Implement strike‑and‑suspend with new threshold (2‑of‑3).

2. **Unit tests**

   * Credits ↔ fee balance interplay.

   * Strike/Suspension gate logic.

3. **Deployment**

   * Pick initial oracle trio, run DKG, push `setpubkey`.

   * Pre‑fill `treasury` pool via BP msig.

# AI Generated Contract Code

```c
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


```

We will add this so the oracles can publish their encryption public key into the rng contract:

```c
TABLE shareblob {
   name      oracle;
   std::vector<uint8_t> blob;          // encrypted share
   uint64_t primary_key() const { return oracle.value; }
};
using shares_table = eosio::multi_index<"shares"_n, shareblob>;

ACTION pushshare(name oracle, std::vector<uint8_t> blob) {
   require_auth(GOV);                  // only during DKG rotation
   shares_table st(get_self(), get_self().value);
   auto it = st.find(oracle.value);
   if(it == st.end()) st.emplace(get_self(), [&](auto& r){ r.oracle=oracle; r.blob=blob; });
   else                st.modify(it, same_payer, [&](auto& r){ r.blob=blob; });
}


```

# AI Generated DKG Code

Dependencies:

```javascript
npm i node-forge secrets.js-grempe elliptic tweetnacl js-sha256
```

RSA DKG share generation and encryption script:

```javascript
// dkg_split.js  –  “dealer-split & encrypt” helper
// Usage: node dkg_split.js oracles.json 2 3
// where oracles.json = [ { "name":"oracle1", "eosPub":"EOS6MRyAj..." }, ... ]

import fs from 'fs';
import forge from 'node-forge';
import secrets from 'secrets.js-grempe';
import { ec as EC } from 'elliptic';
import { sha256 } from 'js-sha256';
import nacl from 'tweetnacl';

const [ , , oracleFile, M, N ] = process.argv;
if(!oracleFile) { console.error('Usage: node dkg_split.js oracles.json M N'); process.exit(1); }

const oracles = JSON.parse(fs.readFileSync(oracleFile));

// 1. generate 3072-bit RSA key
console.log('Generating 3072-bit RSA key … (this takes ~30 s)');
const rsa = forge.pki.rsa.generateKeyPair({ bits: 3072, e: 0x10001 });
const modulusHex = rsa.privateKey.n.toString(16);
const exponent   = rsa.privateKey.e.toString(10);
const dHex       = rsa.privateKey.d.toString(16);
console.log('RSA key ready.');

// 2. Shamir split d into N shares (threshold M)
const shares = secrets.share(dHex, N, M);    // hex strings, index encoded in prefix

// 3. helper: EOSIO K1 pub → compressed hex
function eosPubToHex(pub){
  const bin = Buffer.from(pub.slice(3), 'base58btc'); // strip "EOS"
  return bin.slice(0,33).toString('hex');
}
const ec = new EC('secp256k1');

// 4. ECIES encrypt each share   (ECDH → sharedKey → AES-GCM)
function encryptShare(pubHex, plainHex){
  const eph = ec.genKeyPair();
  const P   = ec.keyFromPublic(pubHex,'hex').getPublic();
  const S   = eph.derive(P);                     // x coordinate (BN)
  const shared = sha256.array(Buffer.from(S.toArray('be',32)));   // 32-byte
  const key = shared.slice(0,32);                // AES-256
  const iv  = nacl.randomBytes(12);
  const cipher = forge.cipher.createCipher('AES-GCM', Buffer.from(key));
  cipher.start({ iv }); cipher.update(forge.util.createBuffer(Buffer.from(plainHex,'hex'))); cipher.finish();
  const tag = cipher.mode.tag.getBytes();
  return Buffer.concat([ Buffer.from(eph.getPublic(true,'array')), Buffer.from(iv), Buffer.from(tag,'binary'), Buffer.from(cipher.output.getBytes(),'binary') ]).toString('hex');
}

// 5. loop oracles
oracles.forEach((o,i)=>{
  if(i>=N) throw Error('More oracles than shares generated');
  const pubHex = eosPubToHex(o.eosPub);
  const ctHex  = encryptShare(pubHex, shares[i]);
  fs.writeFileSync(`share_${o.name}.hex`, ctHex);
  console.log(`  encrypted share for ${o.name} → share_${o.name}.hex`);
});

// 6. save public key
fs.writeFileSync('pubkey.json', JSON.stringify({ modulusHex, exponent }, null, 2));
console.log('\nWrote pubkey.json and encrypted shares. Distribute each .hex over Signal/PGP to its oracle.\n');
```

Oracle encrypted share decryption script:

```javascript
// decrypt_share.js
import fs from 'fs'; import { ec as EC } from 'elliptic'; import { sha256 } from 'js-sha256'; import forge from 'node-forge';
const ec = new EC('secp256k1');
const priv = ec.keyFromPrivate(process.env.ORACLE_PRIV_HEX,'hex');
const ct   = Buffer.from(fs.readFileSync('share_oracle1.hex','utf8'),'hex');
const ephPub = ec.keyFromPublic(ct.slice(0,33),'hex').getPublic();
const shared = sha256.array(priv.derive(ephPub).toArray('be',32));
const key = shared.slice(0,32); const iv = ct.slice(33,45); const tag = ct.slice(45,61); const data = ct.slice(61);
const dec = forge.cipher.createDecipher('AES-GCM', Buffer.from(key));
dec.start({ iv, tag: forge.util.createBuffer(tag) });
dec.update(forge.util.createBuffer(data)); dec.finish();
const shareHex = Buffer.from(dec.output.getBytes(),'binary').toString();
console.log('My Shamir share:', shareHex);
```

# Background links on shared RSA keys and encrypting secrets:

| Topic | Link | Note |
| ----- | ----- | ----- |
| **Threshold-RSA DKG papers** | Efficient Generation of Shared RSA Keys – Boneh/Franklin 1997 (Springer) [SpringerLink](https://link.springer.com/chapter/10.1007/BFb0052253?utm_source=chatgpt.com) | Foundational protocol for multi-party RSA modulus creation. |
|  | Boneh’s summary page (Stanford) [Applied Cryptography Group](https://crypto.stanford.edu/~dabo/abstracts/sharing.html?utm_source=chatgpt.com) | Short overview \+ PDF link. |
| **Open-source DKG implementations** | **ZenGo “vice-city”** distributed RSA key-gen (Rust) [GitHub](https://github.com/ZenGo-X/vice-city?utm_source=chatgpt.com) | Two-party & N-party; good reference code. |
|  | **drand “t-rsa”** (Go) – threshold RSA (PKCS\#1) [GitHub](https://github.com/ssvlabs/ssv-dkg?utm_source=chatgpt.com) | Battle-tested by the drand randomness network. |
| **Shamir secret sharing in JS** | secrets.js-grempe (npm) [GitHub](https://github.com/amper5and/secrets.js/?utm_source=chatgpt.com) | We used this in the sample script. |
| **ECIES encryption libs (secp256k1)** | eciesjs (TypeScript) [GitHub](https://github.com/ecies/js?utm_source=chatgpt.com) | Drop-in encrypt/decrypt with K1 keys. |
|  | ecies-geth (JavaScript) [GitHub](https://github.com/cyrildever/ecies-geth?utm_source=chatgpt.com) | Compatible with Ethereum/WAX key format. |
| **Extra JS Shamir libs** | shamirJS (Node) [GitHub](https://github.com/unusualbob/shamirJS?utm_source=chatgpt.com) | Lightweight alternative. |

