const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(preset = '5+5') {
  const context = vm.createContext({ performance, Date, document: { addEventListener() {} } });
  const root = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'src/clock.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(root, 'src/app.js'), 'utf8') + '\nthis.classes = {GameState, GameClock};', context);
  const { GameState, GameClock } = context.classes;
  const game = new GameState();
  let now = 0;
  const clock = new GameClock(game, () => now);
  function drop(col) {
    if (clock.checkExpiry() || !clock.canPlace()) return null;
    const from = game.current;
    const result = game.applyMove(col);
    if (result) clock.commit(from, result, now);
    return result;
  }
  if (preset) clock.start(preset);
  return { game, clock, drop, advance(ms) { now += ms; } };
}

test('setup gates board; presets start only once with Red and exact time controls', () => {
  for (const [preset, time, increment] of [['5+5',300000,5000],['10+3',600000,3000],['15+0',900000,0]]) {
    const { game, clock, drop } = fixture(null);
    assert.equal(drop(0), null);
    assert.equal(game.current.ply, 0);
    assert.equal(clock.start('invalid'), false);
    assert.equal(clock.start(preset), true);
    assert.equal(clock.runningPlayer, game.currentPlayer);
    assert.equal(clock.runningPlayer, 1);
    assert.equal(clock.remaining[1], time);
    assert.equal(clock.remaining[2], time);
    assert.equal(clock.increment, increment);
    assert.equal(clock.start('15+0'), false);
  }
});

test('legal commits debit the mover, add one increment, and immediately use node.toPlay', () => {
  const { game, clock, drop, advance } = fixture();
  advance(2300);
  const red = drop(3);
  assert.equal(clock.remaining[1], 302700);
  assert.equal(clock.runningPlayer, red.node.toPlay);
  advance(7100);
  assert.equal(clock.timeLeft(1), 302700);
  assert.equal(clock.timeLeft(2), 292900);
  drop(2);
  assert.equal(clock.remaining[2], 297900);
  assert.equal(clock.runningPlayer, game.currentPlayer);
  for (const col of [0,1,2,3,4]) {
    advance(1);
    drop(col);
    assert.equal(clock.runningPlayer, game.currentPlayer);
  }
});

test('invalid/full columns do not hand off or add time; ordinary elapsed time continues', () => {
  const { game, clock, drop, advance } = fixture();
  for (let i = 0; i < 6; i++) drop(0);
  const from = game.current;
  const remaining = {...clock.remaining};
  advance(300);
  for (const col of [0,-1,7]) assert.equal(drop(col), null);
  assert.equal(game.current, from);
  assert.deepEqual({...clock.remaining}, remaining);
  assert.equal(clock.runningPlayer, from.toPlay);
  assert.equal(clock.timeLeft(1), remaining[1] - 300);
});

test('all historical positions reject replay and new variations without changing time or nodes', () => {
  const { game, clock, drop, advance } = fixture();
  drop(0); drop(1); drop(2);
  const live = game.current;
  const remaining = {...clock.remaining};
  const nodeCount = game.nodeById.size;
  for (let node = live.parent; node; node = node.parent) {
    game.goToNode(node);
    for (let col = 0; col < 7; col++) assert.equal(drop(col), null);
    assert.equal(game.current, node);
    assert.equal(game.nodeById.size, nodeCount);
  }
  advance(1000);
  assert.equal(clock.liveNode, live);
  assert.equal(clock.runningPlayer, live.toPlay);
  assert.deepEqual({...clock.remaining}, remaining);
  assert.equal(clock.timeLeft(2), remaining[2] - 1000);
  game.goToNode(live);
  drop(6);
  assert.equal(clock.liveNode, game.current);
  assert.equal(clock.runningPlayer, game.currentPlayer);
  assert.equal(clock.remaining[2], remaining[2] - 1000 + 5000);
  assert.equal(game.nodeById.size, nodeCount + 1);
  for (const node of game.nodeById.values()) assert.ok(node.children.length <= 1);
});

test('connect-four and timeout results lock every historical node until New', () => {
  for (const result of ['connect-four','time']) {
    const { game, clock, drop, advance } = fixture();
    for (const col of [0,1,0,1,0,1]) drop(col);
    if (result === 'connect-four') drop(0);
    else { advance(400000); clock.checkExpiry(); }
    const remaining = {...clock.remaining};
    const nodeCount = game.nodeById.size;
    const finalResult = clock.result;
    for (const node of game.nodeById.values()) {
      game.goToNode(node);
      for (let col = 0; col < 7; col++) assert.equal(drop(col),null);
      assert.equal(game.current,node);
    }
    assert.deepEqual({...clock.remaining},remaining);
    assert.equal(clock.result,finalResult);
    assert.equal(game.nodeById.size,nodeCount);
    game.reset(); clock.reset();
    assert.equal(drop(0),null);
    clock.start('5+5');
    assert.ok(drop(0));
  }
});

test('both connect-four winners freeze at commit, with no final increment', () => {
  for (const [winner, moves] of [[1,[0,1,0,1,0,1,0]],[2,[0,1,0,1,2,1,2,1]]]) {
    const { game, clock, drop, advance } = fixture();
    for (const col of moves) { advance(1000); drop(col); }
    assert.equal(clock.status, 'finished');
    assert.equal(clock.result.winner, winner);
    assert.equal(clock.result.reason, 'connect-four');
    assert.equal(clock.remaining[winner], 311000);
    assert.equal(game.current.isWin, true);
    assert.equal(game.current.winCells.length, 4);
    advance(600000);
    assert.equal(clock.timeLeft(winner), 311000);
    assert.equal(drop(6), null);
  }
});

test('deadline wins over a late click; timeout never sets board win cells', () => {
  for (const loser of [1,2]) {
    const { game, clock, drop, advance } = fixture('15+0');
    if (loser === 2) drop(0);
    const live = game.current;
    advance(900000);
    assert.equal(drop(3), null);
    assert.equal(game.current, live);
    assert.equal(clock.result.reason, 'time');
    assert.equal(clock.result.winner, loser === 1 ? 2 : 1);
    assert.equal(clock.remaining[loser], 0);
    assert.equal(game.current.isWin, false);
    assert.equal(game.current.winCells.length, 0);
    assert.equal(clock.runningPlayer, null);
  }
});

test('timeout still happens while browsing; New resets deadline, result and preset', () => {
  const { game, clock, drop, advance } = fixture();
  drop(1);
  const live = game.current;
  game.goToNode(game.root);
  advance(301000);
  assert.equal(clock.checkExpiry(), true);
  assert.equal(clock.result.nodeId, live.id);
  assert.equal(clock.result.winner, 1);
  assert.equal(clock.checkExpiry(), false);
  game.reset(); clock.reset();
  assert.equal(clock.liveNode, game.root);
  assert.equal(clock.status, 'setup');
  assert.equal(clock.result, null);
  assert.equal(clock.preset, null);
  clock.start('10+3');
  advance(1000);
  assert.equal(clock.timeLeft(1), 599000);
});

test('a full board draw stops both clocks without a false winner', () => {
  const { game, clock, drop } = fixture();
  const moves = [1,6,5,2,0,1,5,3,4,5,6,5,6,2,4,3,6,3,1,2,5,5,1,1,2,2,3,3,2,1,0,3,4,4,4,6,0,0,4,6,0,0];
  for (const col of moves) assert.ok(drop(col));
  assert.equal(game.current.ply, 42);
  assert.equal(game.current.isWin, false);
  assert.equal(clock.status, 'finished');
  assert.equal(clock.result.reason, 'draw');
  assert.equal(clock.result.winner, null);
  assert.equal(clock.runningPlayer, null);
  assert.equal(drop(0), null);
});
