const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e12;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:1});S.dk=S.dk||dkState();S.dk.m.fra=2";

test('DE-Kicks harmonisation raises the price for years, then stops at a ceiling', () => {
  const { ev, errors } = load();
  ev(start);
  assert.equal(ev("S.ixp.fra"), 1, 'joined the DE-Kicks exchange');
  const base = ev("PORT[1].ix*ixMul('fra')");
  ev("for(let d=1;d<=360*10;d++)dkTick(d)");
  const tenYears = ev("dkMult('fra')");
  assert.ok(tenYears > 2 && tenYears <= ev("DK_MAX"), 'it still climbs at first');
  ev("for(let d=360*10;d<=360*70;d++)dkTick(d)");
  assert.equal(ev("dkMult('fra')"), ev("DK_MAX"), 'sixty more years stay at the ceiling');
  assert.equal(ev("ixPortMo('fra',1)"), Math.round(base * ev("DK_MAX")), 'so the port costs a few times list, never a hundred');
  assert.deepEqual(errors, []);
});

test('a save that already ran away reads as the ceiling, and a capped price stops announcing rises', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.dk.m.fra=40");
  assert.equal(ev("dkMult('fra')"), ev("DK_MAX"));
  ev("S.inc=[];S.dk.add.fra=[]");
  const day = ev("(()=>{for(let d=1;d<400;d++)if((d+hstr('fra')%90)%365===0)return d;})()");
  ev(`Math.random=()=>0.9;toast=(...a)=>{(window.__t=window.__t||[]).push(a[0])};dkTick(${day})`);
  assert.equal(ev("(window.__t||[]).filter(t=>/harmonised/i.test(t)).length"), 0, 'no "prices up" toast at the ceiling');
  assert.deepEqual(errors, []);
});

test('loading a save clamps a runaway DE-Kicks price and the quote it remembers, so rejoining is not quoted at 40× list', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.dk.m.fra=40;S.dk.lastQ={fra:{m:40,h:3,until:S.day+365}};S.dk.m.mad='x';S=sanitize(S)||S");
  assert.equal(ev("S.dk.m.fra"), ev("DK_MAX"));
  assert.equal(ev("S.dk.lastQ.fra.m"), ev("DK_MAX"));
  assert.equal(ev("'mad' in S.dk.m"), false, 'junk is dropped');
  assert.deepEqual(errors, []);
});

test('a rise clipped by the ceiling announces only what the bill shows', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.dk.m.fra=3.9;S.dk.add.fra=[1,2,3]");
  const day = ev("(()=>{for(let d=1;d<400;d++)if((d+hstr('fra')%90)%365===0)return d;})()");
  ev(`Math.random=()=>0.9;toast=(...a)=>{(window.__t=window.__t||[]).push(a[0])};dkTick(${day})`);
  const t = ev("(window.__t||[]).find(t=>/harmonised/i.test(t))||''");
  assert.match(t, /\b3\s?%/, `a 3% rise, not 14%: ${t}`);
  assert.deepEqual(errors, []);
});
