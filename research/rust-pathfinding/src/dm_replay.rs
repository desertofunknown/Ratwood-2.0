//! Synchronous, bounded, frozen-input compatibility experiment. No worker/FFI use.
//! Arithmetic is explicit f32; acceptance requires the pinned DM numeric oracle.
//! This does not claim compatibility with live callbacks or every possible dist proc.

const DIRS: [u8; 4] = [1, 2, 4, 8]; // NORTH, SOUTH, EAST, WEST
const REVERSE: [u8; 4] = [2, 1, 8, 4];
const ALL: u8 = 15;
pub const MAX_NODES: usize = 256;
pub const MAX_EVENTS: usize = 4096;
pub const MAX_TRACE_BYTES: usize = 4 * 1024 * 1024;

/// Row columns are node indices, plus one final column representing null.
/// Preserve denied candidates: they can still prune a discovered node's bf.
#[derive(Clone, Debug)]
pub struct Node {
    pub z: i32,
    pub goal_distance: f32,
    pub candidates: [Option<usize>; 4],
    pub distance: Vec<f32>,
    pub allowed: Vec<bool>,
}
#[derive(Clone, Debug)]
pub struct Input {
    pub nodes: Vec<Node>, pub start: Option<usize>, pub goal: Option<usize>,
    pub exclude: Option<usize>, pub maxnodes: f32, pub supplied_depth: f32,
    pub mintargetdist: f32, pub allow_multiz: bool,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Record {
    pub node: usize, pub parent: Option<usize>, pub g: f32, pub h: f32,
    pub f: f32, pub depth: u32, pub bf: u8,
}
#[derive(Clone, Debug, PartialEq)]
pub enum Event {
    Distance { from: usize, to: Option<usize>, value: f32 },
    Range { from: usize, to: usize, value: f32 },
    Adjacent { from: usize, to: Option<usize>, allowed: bool },
    Next { from: usize, direction: u8, to: Option<usize> },
    State { current: usize, heap: Vec<usize>, records: Vec<Record> },
    End { kind: EndKind, path: Vec<usize> },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EndKind { False, Null, Path }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Unsupported {
    InvalidInput, NumericDomain, NodeLimit, TraceLimit, MissingHeapRecord,
    NullAccepted, ParentCycle, Interrupted, PathLimit,
}
#[derive(Debug)]
pub struct Report {
    pub outcome: Result<(EndKind, Vec<usize>), Unsupported>, pub events: Vec<Event>,
}

struct Machine<'a> {
    input: &'a Input, checkpoint: &'a mut dyn FnMut() -> Result<(), Unsupported>,
    path_limit: usize, records: Vec<Option<Record>>, heap: Vec<usize>,
    events: Vec<Event>, trace_bytes: usize,
}

/// Explicit intermediate operations. Do not use mul_add or epsilon comparisons.
fn weight(g: f32, h: f32) -> Result<f32, Unsupported> {
    let factor: f32 = 1.0_f32 + 0.005_f32;
    let weighted: f32 = h * factor;
    let f: f32 = g + weighted;
    if f.is_finite() { Ok(f) } else { Err(Unsupported::NumericDomain) }
}
fn validate(input: &Input, checkpoint: &mut dyn FnMut() -> Result<(), Unsupported>) -> Result<(), Unsupported> {
    checkpoint()?;
    let n = input.nodes.len();
    if n > MAX_NODES { return Err(Unsupported::NodeLimit); }
    if [input.start, input.goal, input.exclude].into_iter().flatten().any(|i| i >= n) {
        return Err(Unsupported::InvalidInput);
    }
    if ![input.maxnodes, input.supplied_depth, input.mintargetdist].iter().all(|v| v.is_finite()) {
        return Err(Unsupported::NumericDomain);
    }
    for node in &input.nodes {
        checkpoint()?;
        if node.distance.len() != n + 1 || node.allowed.len() != n + 1
            || node.candidates.iter().flatten().any(|&i| i >= n) {
            return Err(Unsupported::InvalidInput);
        }
        // Negative or nonfinite callback outputs are outside this first experiment.
        if !node.goal_distance.is_finite() || node.goal_distance < 0.0
            || node.distance.iter().any(|v| !v.is_finite() || *v < 0.0) {
            return Err(Unsupported::NumericDomain);
        }
    }
    Ok(())
}
impl Machine<'_> {
    fn emit(&mut self, event: Event) -> Result<(), Unsupported> {
        (self.checkpoint)()?;
        // Conservative accounted payload budget; not a total process RSS guarantee.
        let charge = match &event {
            Event::State { heap, records, .. } => 256 + heap.len() * 16 + records.len() * 128,
            Event::End { path, .. } => 256 + path.len() * 16,
            _ => 256,
        };
        if self.events.len() >= MAX_EVENTS || self.trace_bytes + charge > MAX_TRACE_BYTES {
            return Err(Unsupported::TraceLimit);
        }
        self.trace_bytes += charge;
        self.events.push(event);
        Ok(())
    }
    fn distance(&mut self, from: usize, to: Option<usize>) -> Result<f32, Unsupported> {
        let value = self.input.nodes[from].distance[to.unwrap_or(self.input.nodes.len())];
        self.emit(Event::Distance { from, to, value })?;
        Ok(value)
    }
    fn range(&mut self, from: usize, to: usize) -> Result<f32, Unsupported> {
        let value = self.input.nodes[from].goal_distance;
        self.emit(Event::Range { from, to, value })?;
        Ok(value)
    }
    fn adjacent(&mut self, from: usize, to: Option<usize>) -> Result<bool, Unsupported> {
        let allowed = self.input.nodes[from].allowed[to.unwrap_or(self.input.nodes.len())];
        self.emit(Event::Adjacent { from, to, allowed })?;
        Ok(allowed)
    }
    fn record(&self, node: usize) -> &Record { self.records[node].as_ref().unwrap() }
    fn f(&self, heap_index: usize) -> f32 { self.record(self.heap[heap_index - 1]).f }
    /// One-based indices mirror the source; equal priorities NEVER swap.
    fn swim(&mut self, mut index: usize) {
        let mut parent = index / 2; // gated by actual DM round(index * 0.5) probes
        while parent > 0 && self.f(parent) - self.f(index) > 0.0 {
            self.heap.swap(index - 1, parent - 1);
            index = parent; parent = index / 2;
        }
    }
    fn child(&self, index: usize) -> usize {
        let left = index * 2;
        if left > self.heap.len() { 0 }
        else if left + 1 > self.heap.len() { left }
        else if self.f(left + 1) - self.f(left) < 0.0 { left + 1 }
        else { left }
    }
    fn sink(&mut self, mut index: usize) {
        let mut child = self.child(index);
        while child > 0 && self.f(child) - self.f(index) < 0.0 {
            self.heap.swap(child - 1, index - 1);
            index = child; child = self.child(index);
        }
    }
    fn insert(&mut self, node: usize) { self.heap.push(node); self.swim(self.heap.len()); }
    fn pop(&mut self) -> usize {
        let node = self.heap[0];
        let last = self.heap.pop().unwrap();
        if !self.heap.is_empty() { self.heap[0] = last; self.sink(1); }
        node
    }
    fn resort(&mut self, node: usize) -> Result<(), Unsupported> {
        let index = match self.heap.iter().position(|&n| n == node) {
            Some(i) => i + 1,
            // Pinned DM oracle: Find=0, Swim(0), Sink(0) is a no-op on EMPTY L.
            None if self.heap.is_empty() => return Ok(()),
            None => return Err(Unsupported::MissingHeapRecord),
        };
        self.swim(index);
        self.sink(index); // deliberately ORIGINAL index, exactly as DM source
        Ok(())
    }
    fn state(&mut self, current: usize) -> Result<(), Unsupported> {
        self.emit(Event::State { current, heap: self.heap.clone(),
            records: self.records.iter().flatten().cloned().collect() })
    }
    fn run(&mut self) -> Result<(EndKind, Vec<usize>), Unsupported> {
        (self.checkpoint)()?;
        let (start, goal) = match (self.input.start, self.input.goal) {
            (Some(s), Some(g)) => (s, g), _ => return Ok((EndKind::False, vec![])),
        };
        if start == goal { return Ok((EndKind::False, vec![])); }
        if !self.input.allow_multiz && self.input.nodes[start].z != self.input.nodes[goal].z {
            return Ok((EndKind::False, vec![]));
        }
        let mut depth_limit = self.input.supplied_depth;
        if self.input.maxnodes != 0.0 {
            if self.range(start, goal)? > self.input.maxnodes { return Ok((EndKind::False, vec![])); }
            depth_limit = self.input.maxnodes;
        }
        let h = self.distance(start, Some(goal))?;
        self.records[start] = Some(Record { node: start, parent: None, g: 0.0, h,
            f: weight(0.0, h)?, depth: 0, bf: ALL });
        self.insert(start);
        while !self.heap.is_empty() {
            (self.checkpoint)()?;
            let current = self.pop();
            let close = self.input.mintargetdist != 0.0
                && self.range(current, goal)? <= self.input.mintargetdist;
            if current == goal || close {
                let mut path = Vec::with_capacity(self.records.len());
                let mut next = Some(current);
                while let Some(node) = next {
                    (self.checkpoint)()?;
                    if path.len() >= self.records.len() { return Err(Unsupported::ParentCycle); }
                    if path.len() >= self.path_limit { return Err(Unsupported::PathLimit); }
                    path.push(node); next = self.record(node).parent;
                }
                path.reverse(); return Ok((EndKind::Path, path));
            }
            if depth_limit != 0.0 && self.record(current).depth as f32 > depth_limit {
                self.records[current].as_mut().unwrap().bf = 0;
                self.state(current)?; continue;
            }
            for d in 0..4 {
                (self.checkpoint)()?;
                if self.record(current).bf & DIRS[d] == 0 { continue; }
                let target = self.input.nodes[current].candidates[d];
                self.emit(Event::Next { from: current, direction: DIRS[d], to: target })?;
                if target == self.input.exclude { continue; }
                let cost = self.distance(current, target)?;
                let newg = self.record(current).g + cost;
                if !newg.is_finite() { return Err(Unsupported::NumericDomain); }
                let existing = target.filter(|&n| self.records[n].is_some());
                if let Some(node) = existing {
                    self.records[node].as_mut().unwrap().bf &= ALL ^ REVERSE[d];
                    if newg < self.record(node).g && self.adjacent(current, target)? {
                        let h = self.record(node).h;
                        let depth = self.record(current).depth + 1;
                        let old = self.records[node].as_mut().unwrap();
                        old.parent = Some(current); old.g = newg;
                        old.f = weight(newg, h)?; old.depth = depth;
                        self.resort(node)?;
                    }
                } else if self.adjacent(current, target)? {
                    let node = target.ok_or(Unsupported::NullAccepted)?;
                    let h = self.distance(node, Some(goal))?;
                    self.records[node] = Some(Record { node, parent: Some(current), g: newg,
                        h, f: weight(newg, h)?, depth: self.record(current).depth + 1,
                        bf: ALL ^ REVERSE[d] });
                    self.insert(node);
                }
            }
            self.records[current].as_mut().unwrap().bf = 0;
            self.state(current)?;
        }
        Ok((EndKind::Null, vec![]))
    }
}

pub fn replay(input: &Input) -> Report {
    replay_controlled(input, MAX_NODES, &mut || Ok(()))
}

// Internal-only control: no user callback or DM handle can enter a worker search.
// A work unit is one checkpoint-separated chunk, bounded by MAX_NODES (256)
// for heap scans/copies or 257 values for a validation row, not CPU instructions.
pub(crate) fn replay_controlled(input: &Input, path_limit: usize,
    checkpoint: &mut dyn FnMut() -> Result<(), Unsupported>) -> Report {
    if let Err(error) = validate(input, checkpoint) { return Report { outcome: Err(error), events: vec![] }; }
    let mut machine = Machine { input, checkpoint, path_limit, records: vec![None; input.nodes.len()],
        heap: Vec::with_capacity(input.nodes.len()), events: Vec::new(), trace_bytes: 0 };
    let mut outcome = machine.run();
    if let Ok((kind, path)) = &outcome {
        if let Err(error) = machine.emit(Event::End { kind: *kind, path: path.clone() }) {
            outcome = Err(error);
        }
    }
    Report { outcome, events: machine.events }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn line(n: usize) -> Input {
        let mut nodes = Vec::new();
        for i in 0..n {
            let mut candidates = [None; 4];
            if i + 1 < n { candidates[2] = Some(i + 1); }
            if i > 0 { candidates[3] = Some(i - 1); }
            let distance = (0..=n).map(|j| if j == n { 0.0 } else { i.abs_diff(j) as f32 }).collect();
            let mut allowed = vec![true; n + 1]; allowed[n] = false;
            nodes.push(Node { z: 1, goal_distance: (n - 1 - i) as f32, candidates, distance, allowed });
        }
        Input { nodes, start: Some(0), goal: Some(n - 1), exclude: None, maxnodes: 0.0,
            supplied_depth: 30.0, mintargetdist: 0.0, allow_multiz: true }
    }
    #[test] fn source_goal_depth_boundary_and_overwrite() {
        let mut input = line(3); input.supplied_depth = 1.0;
        assert_eq!(replay(&input).outcome, Ok((EndKind::Path, vec![0,1,2])));
        input = line(4); input.supplied_depth = 1.0;
        assert_eq!(replay(&input).outcome, Ok((EndKind::Null, vec![])));
        input.maxnodes = 3.0;
        assert_eq!(replay(&input).outcome, Ok((EndKind::Path, vec![0,1,2,3])));
    }
    #[test] fn source_early_guards_and_near_goal() {
        let mut input = line(2); input.mintargetdist = 1.0;
        assert_eq!(replay(&input).outcome, Ok((EndKind::Path, vec![0])));
        input.goal = input.start;
        assert_eq!(replay(&input).outcome, Ok((EndKind::False, vec![])));
        input = line(3); input.maxnodes = 1.0; input.mintargetdist = 10.0;
        assert_eq!(replay(&input).outcome, Ok((EndKind::False, vec![])));
    }
    #[test] fn source_heap_equal_four() {
        let input = line(4);
        let mut noop = || Ok(());
        let mut m = Machine { input: &input, checkpoint: &mut noop, path_limit: MAX_NODES, records: (0..4).map(|node| Some(Record { node,
            parent: None, g: 1.0, h: 0.0, f: 1.0, depth: 0, bf: ALL })).collect(),
            heap: vec![], events: vec![], trace_bytes: 0 };
        for n in 0..4 { m.insert(n); }
        assert_eq!((0..4).map(|_| m.pop()).collect::<Vec<_>>(), vec![0,3,2,1]);
        assert_eq!(m.resort(0), Ok(()));
        m.insert(1);
        assert_eq!(m.resort(0), Err(Unsupported::MissingHeapRecord));
    }
    #[test] fn budget_exhaustion_is_unsupported_not_no_path() {
        let mut input = line(MAX_NODES); input.supplied_depth = 0.0;
        assert_eq!(replay(&input).outcome, Err(Unsupported::TraceLimit));
        assert_eq!(replay(&line(MAX_NODES + 1)).outcome, Err(Unsupported::NodeLimit));
    }
    #[test] fn rejects_invalid_and_nonfinite_inputs() {
        let mut input = line(2); input.nodes[0].distance[1] = f32::NAN;
        assert_eq!(replay(&input).outcome, Err(Unsupported::NumericDomain));
        input = line(2); input.nodes[0].candidates[0] = Some(2);
        assert_eq!(replay(&input).outcome, Err(Unsupported::InvalidInput));
    }
}

#[cfg(test)]
#[path = "dm_numeric_oracle_tests.rs"]
mod numeric_oracle_tests;
