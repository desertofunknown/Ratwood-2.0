"""Source-bound missing-member heap regressions; never executes DM/BYOND.

Run: python3 tools/ci/test_heap_missing_member.py
Optional --repo, --heap-source and --fixture support baseline/scratch checks.
The cardinal AStar witness is a constructed, same-z, isolated-goal fixture, not
an observed shipped-map occurrence. The guard only prevents invalid heap repair:
it does not undo caller mutations, reopen closed nodes or prove path optimality.
Reviewed source-block digests deliberately fail on drift; review the model before
updating them. Python's 1-based list checks and float32 arithmetic are models,
not evidence of native list behavior, map initialization or engine integration.
"""
import argparse
from dataclasses import dataclass
from hashlib import sha256
from itertools import product
import json
from pathlib import Path
import re
import struct
import unittest

ROOT = Path(__file__).resolve().parents[2]
HEAP_SOURCE = None
FIXTURE = Path(__file__).with_name('fixtures') / 'heap_missing_member.json'
HEAP = 'code/__HELPERS/heap.dm'
RESORT = '/datum/path_minheap/proc/ReSort(atom/A)'
BASELINE_RESORT = '\tvar/index = L.Find(A)\n\tSwim(index)\n\tSink(index)'
FIXED_RESORT = BASELINE_RESORT.replace('\n\tSwim(index)', '\n\tif(!index)\n\t\treturn\n\tSwim(index)')
BASELINE_HEAP_SHA256 = '9ace0899c7c924334f27775665b676fa9d4c77eac5b472fe7e07095148d888f9'
DIRECTIONS = ((1, (0, 1)), (2, (0, -1)), (4, (1, 0)), (8, (-1, 0)))
REVERSE = {1: 2, 2: 1, 4: 8, 8: 4}


def active(source):
    """Remove comments without treating quoted text as comments; not a DM parser."""
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda m: '\n' * m[0].count('\n')
                  if m[0].startswith(('//', '/*')) else m[0], source, flags=re.S)


def canonical(source):
    return '\n'.join(line.rstrip() for line in active(source).splitlines() if line.strip())


def body(source, header, allow_reopened=False):
    matches = re.findall(r'^' + re.escape(header) + r'[ \t]*\n(.*?)(?=^/|\Z)',
                         active(source), re.M | re.S)
    if not matches or (len(matches) != 1 and not allow_reopened):
        raise AssertionError(f'Unexpected active definition count: {header}')
    return ('\n' + header + '\n').join(canonical(match) for match in matches)


def digest(source):
    return sha256(canonical(source).encode()).hexdigest()


def heap_mode(source):
    actual = body(source, RESORT)
    if actual not in (BASELINE_RESORT, FIXED_RESORT):
        raise AssertionError('Unreviewed ReSort body; review the model')
    baseline = canonical(source).replace(FIXED_RESORT, BASELINE_RESORT)
    if digest(baseline) != BASELINE_HEAP_SHA256:
        raise AssertionError('Unreviewed heap source outside the missing-member guard')
    return actual == FIXED_RESORT


def verify_contracts(fixture):
    for contract in fixture['source_contracts']:
        source = (ROOT / contract['path']).read_text()
        reviewed = '\n'.join(header + '\n' + body(source, header, allow_reopened=True)
                             for header in contract['headers'])
        if digest(reviewed) != contract['sha256']:
            raise AssertionError('Source contract changed; review the model: ' + contract['purpose'])
    astar = canonical((ROOT / 'code/__HELPERS/AStar.dm').read_text())
    assert '#define PF_TIEBREAKER 0.005' in astar.splitlines()
    mapping = active((ROOT / 'code/_globalvars/lists/mapping.dm').read_text())
    assert re.findall(r'^GLOBAL_LIST_INIT\(cardinals, (.*)\)$', mapping, re.M) == [
        'list(NORTH, SOUTH, EAST, WEST)']
    reverse = re.findall(r'GLOBAL_LIST_INIT\(reverse_dir, list\((.*?)\)\)', mapping, re.S)
    assert len(reverse) == 1
    values = [int(value) for value in reverse[0].split(',')]
    assert {direction: values[direction - 1] for direction in REVERSE} == REVERSE


def f32(value):
    return struct.unpack('f', struct.pack('f', value))[0]


@dataclass(eq=False)
class Node:
    f: float
    pos: tuple = None
    g: int = 0
    heuristic: int = 0
    depth: int = 0
    bf: int = 15
    previous: object = None


class Heap:
    """Direct transcription of the bound heap bodies, with invalid indices rejected."""
    def __init__(self, guarded):
        self.guarded = guarded
        self.L = [None]

    def __len__(self):
        return len(self.L) - 1

    def at(self, index):
        if not 1 <= index <= len(self):
            raise IndexError(f'invalid 1-based heap index {index}, length {len(self)}')
        return self.L[index]

    def swim(self, index):
        parent = index // 2  # DM round(index * 0.5) floors these nonnegative values.
        while parent > 0 and self.at(parent).f - self.at(index).f > 0:
            self.L[index], self.L[parent] = self.L[parent], self.L[index]
            index = parent
            parent = index // 2

    def sink(self, index):
        child = index * 2
        length = len(self)
        if child > length:
            child = 0
        elif child + 1 <= length and self.at(child + 1).f - self.at(child).f < 0:
            child += 1
        while child > 0 and self.at(child).f - self.at(index).f < 0:
            self.L[index], self.L[child] = self.L[child], self.L[index]
            index = child
            child = index * 2
            if child > length:
                child = 0
            elif child + 1 <= length and self.at(child + 1).f - self.at(child).f < 0:
                child += 1

    def insert(self, node):
        self.L.append(node)
        self.swim(len(self))

    def pop(self):
        if not len(self):
            return 0
        first = self.L[1]
        self.L[1] = self.L[-1]
        self.L.pop()
        if len(self):
            self.sink(1)
        return first

    def resort(self, node):
        index = next((i for i, value in enumerate(self.L[1:], 1) if value is node), 0)
        if self.guarded and not index:
            return
        self.swim(index)
        self.sink(index)

    def valid(self):
        return all(self.L[i // 2].f <= self.L[i].f for i in range(2, len(self) + 1))


def run_witness(fixture, guarded, rounding=f32):
    """Same-z branch only: no stairs, hazards, occupants, exclusions or platform costs."""
    tiles = {tuple(row[:2]): tuple(row[2:]) for row in fixture['tiles']}
    start, goal = tuple(fixture['start']), tuple(fixture['goal'])

    def distance(a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def heuristic(a, b):
        direction = (4 if b[0] > a[0] else 8 if b[0] < a[0] else 0)
        direction |= 1 if b[1] > a[1] else 2 if b[1] < a[1] else 0
        slowdown, river, _ = tiles[a]
        if river:
            slowdown += -2 if direction == river else 2 if direction == REVERSE[river] else 1
        return distance(a, b) + slowdown

    def priority(g, h):
        return rounding(g + rounding(h * rounding(1 + rounding(0.005))))

    assert distance(start, goal) <= fixture['maxnodes']
    queue = Heap(guarded)
    first = Node(priority(0, heuristic(start, goal)), start, heuristic=heuristic(start, goal))
    queue.insert(first)
    discovered = {start: first}
    pops, repairs = [], []
    while len(queue):
        current = queue.pop()
        pops.append([*current.pos, current.g, current.depth])
        if current.pos == goal or distance(current.pos, goal) <= fixture['mintargetdist']:
            raise AssertionError('Isolated goal unexpectedly reached; path reconstruction is outside this model')
        if fixture['maxnodes'] and current.depth > fixture['maxnodes']:
            current.bf = 0
            continue
        for direction, (dx, dy) in DIRECTIONS:
            if not current.bf & direction:
                continue
            target = (current.pos[0] + dx, current.pos[1] + dy)
            if target not in tiles:  # Dense walls cannot pass adjacency or enter discovered.
                continue
            candidate = discovered.get(target)
            new_g = current.g + heuristic(current.pos, target)
            allowed = tiles[target][2] != REVERSE[direction]
            if candidate:
                candidate.bf &= 15 ^ REVERSE[direction]
                if new_g < candidate.g and allowed:
                    before = candidate.g
                    candidate.previous = current
                    candidate.g = new_g
                    candidate.f = priority(new_g, candidate.heuristic)
                    candidate.depth = current.depth + 1
                    repairs.append({'position': list(target), 'old_g': before, 'new_g': new_g,
                                    'present': candidate in queue.L, 'from': list(candidate.previous.pos),
                                    'queue_length': len(queue), 'bf': candidate.bf,
                                    'depth': candidate.depth})
                    try:
                        queue.resort(candidate)
                    except IndexError as error:
                        return {'error': str(error), 'path': None, 'pops': pops, 'repairs': repairs}
            elif allowed:
                h = heuristic(target, goal)
                candidate = Node(priority(new_g, h), target, new_g, h, current.depth + 1,
                                 15 ^ REVERSE[direction], current)
                queue.insert(candidate)
                discovered[target] = candidate
        current.bf = 0
        assert queue.valid()
    return {'error': None, 'path': None, 'pops': pops, 'repairs': repairs}


class HeapMissingMemberTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = HEAP_SOURCE.read_text() if HEAP_SOURCE else (ROOT / HEAP).read_text()
        cls.guarded = heap_mode(cls.source)
        cls.fixture = json.loads(FIXTURE.read_text())
        verify_contracts(cls.fixture)

    def test_source_has_only_the_missing_member_guard(self):
        self.assertTrue(self.guarded, 'ReSort must return when L.Find(A) is zero')

    def test_unreviewed_heap_changes_are_rejected(self):
        changed = self.source.replace('L[. + 1].f - L[.].f) < 0', 'L[. + 1].f - L[.].f) > 0')
        with self.assertRaisesRegex(AssertionError, 'outside the missing-member guard'):
            heap_mode(changed)

    def test_absent_member_is_noop_for_empty_singleton_and_multiple_entries(self):
        for keys in ((), (1,), (2, 1), (3, 1, 2), (4, 0, 2, 1, 3)):
            with self.subTest(keys=keys):
                queue = Heap(self.guarded)
                for key in keys:
                    queue.insert(Node(key))
                before = queue.L.copy()
                absent = Node(-100)
                absent_before = vars(absent).copy()
                self.assertIsNone(queue.resort(absent))
                self.assertEqual(queue.L, before)
                self.assertEqual(vars(absent), absent_before)
                self.assertEqual([queue.pop().f for _ in keys], sorted(keys))
                self.assertEqual(queue.pop(), 0)

    def test_original_missing_member_behavior_is_reproduced(self):
        queue = Heap(False)
        self.assertIsNone(queue.resort(Node(0)))
        for length in (1, 2, 3):
            queue = Heap(False)
            for key in range(length):
                queue.insert(Node(key))
            with self.assertRaisesRegex(IndexError, f'index 0, length {length}'):
                queue.resort(Node(0))

    def test_present_member_order_is_identical_in_106620_reprioritizations(self):
        cases = 0
        for size in range(8):
            for keys in product(range(3), repeat=size):
                nodes = [Node(key) for key in keys]
                baseline, actual = Heap(False), Heap(self.guarded)
                for node in nodes:
                    baseline.insert(node)
                    actual.insert(node)
                    self.assertEqual(actual.L, baseline.L)
                    self.assertTrue(actual.valid())
                original = actual.L.copy()
                self.assertEqual([actual.pop().f for _ in nodes], sorted(keys))
                self.assertEqual(actual.pop(), 0)
                for node in nodes:
                    old = node.f
                    for key in (-1, 0, 1, 2, 3):
                        baseline.L, actual.L = original.copy(), original.copy()
                        node.f = key
                        baseline.resort(node)
                        actual.resort(node)
                        self.assertEqual(actual.L, baseline.L)
                        self.assertTrue(actual.valid())
                        drained = []
                        while len(actual):
                            result = actual.pop()
                            self.assertIs(result, baseline.pop())
                            drained.append(result.f)
                            self.assertEqual(actual.L, baseline.L)
                            self.assertTrue(actual.valid())
                        self.assertEqual(drained, sorted(n.f for n in nodes))
                        self.assertEqual(actual.pop(), 0)
                        cases += 1
                    node.f = old
        self.assertEqual(cases, 106620)

    def test_source_bound_constructed_caller_reproduces_baseline_failure(self):
        for rounding in (f32, float):
            with self.subTest(rounding=rounding.__name__):
                result = run_witness(self.fixture, False, rounding)
                self.assertEqual(result['error'], 'invalid 1-based heap index 0, length 1')
                self.assertEqual(result['pops'], self.fixture['pops_before_repair'])
                self.assertEqual(result['repairs'], [self.fixture['repair']])

    def test_guarded_caller_drains_leaf_without_reopening_closed_node(self):
        for rounding in (f32, float):
            with self.subTest(rounding=rounding.__name__):
                result = run_witness(self.fixture, self.guarded, rounding)
                self.assertIsNone(result['error'])
                self.assertIsNone(result['path'])
                self.assertEqual(result['pops'], self.fixture['pops_before_repair'] + [[5, 4, 10, 7]])
                # Existing caller g/previous/depth edits remain; closed bf is still zero.
                self.assertEqual(result['repairs'], [self.fixture['repair']])

    def test_witness_controls_do_not_trigger_invalid_heap_access(self):
        for name in ('bench', 'east_river', 'queued_leaf'):
            fixture = json.loads(json.dumps(self.fixture))
            for row in fixture['tiles'][:]:
                if name == 'bench' and row[:2] == [5, 1]:
                    row[4] = 0
                elif name == 'east_river' and row[:2] == [4, 3]:
                    row[2:4] = [0, 0]
                elif name == 'queued_leaf' and row[:2] == [5, 4]:
                    fixture['tiles'].remove(row)
            with self.subTest(control=name):
                self.assertIsNone(run_witness(fixture, False)['error'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--heap-source', type=Path)
    parser.add_argument('--fixture', type=Path, default=FIXTURE)
    args, remaining = parser.parse_known_args()
    ROOT, HEAP_SOURCE, FIXTURE = args.repo, args.heap_source, args.fixture
    unittest.main(argv=[__file__, *remaining])
