type Edge = { from: string; to: string; r: number }; // [-1,1]
export function buildF(view: string[], gcsInclusions: Record<string, Uint8Array>) {
  // gcsInclusions[peer][k] = 1 if peer's block at index k is in my greatest common subset
  const peers = view;
  const F: Record<string, Record<string, number>> = {};
  for (const i of peers) {
    F[i] = {};
    for (const j of peers) {
      if (i === j) { F[i][j] = 0; continue; }
      const bi = gcsInclusions[i], bj = gcsInclusions[j];
      const n = Math.min(bi.length, bj.length) || 1;
      let agree = 0, disagree = 0;
      for (let k=0;k<n;k++){ if (bi[k]===bj[k]) agree++; else disagree++; }
      const pAgree = agree/n, pDis = disagree/n;
      // relative joint-entropy-ish score: high when overlap is high, low when conflict/disorder
      const r = (pAgree - pDis); // in [-1,1]
      F[i][j] = r;
    }
  }
  return F;
}
export function buildEdges(F: Record<string, Record<string, number>>): Edge[] {
  const edges: Edge[] = [];
    for (const from in F) {
        for (const to in F[from]) { 
            if (from !== to) {
                edges.push({ from, to, r: F[from][to] });
            }
        }   
    }
    return edges;
}
export function buildEdgeMap(edges: Edge[]): Record<string, Record<string, number>> {
    const edgeMap: Record<string, Record<string, number>> = {};
    for (const edge of edges) {
        if (!edgeMap[edge.from]) edgeMap[edge.from] = {};
        edgeMap[edge.from][edge.to] = edge.r;
    }
    return edgeMap;
}

export function SAWTrust(F: Record<string, Record<string, number>>, iters=2000, batch=100) {
  const peers = Object.keys(F);
  const posNbrs: Record<string, Array<[string, number]>> = {};
  for (const i of peers) {
    const edges = Object.entries(F[i]).filter(([_,w])=>w>0);
    const sum = edges.reduce((a,[,w])=>a+w,0) || 1;
    posNbrs[i] = edges.map(([j,w])=>[j, w/sum]);
  }
  let scores: Record<string, number> = Object.fromEntries(peers.map(p=>[p,0]));
  let prev: Record<string, number> = {...scores};

  const rmse = () => Math.sqrt(peers.reduce((s,p)=>s+((scores[p]-prev[p])**2),0)/peers.length);

  const walkOnce = (start: string, steps: number) => {
    const visited = new Set<string>([start]);
    let cur = start;
    for (let h=0; h<steps; h++){
      const nbrs = posNbrs[cur].filter(([j])=>!visited.has(j));
      if (!nbrs.length) break;
      // sample by normalized weights
      let r = Math.random(), acc = 0, next = nbrs[nbrs.length-1][0];
      for (const [j,w] of nbrs){ acc += w; if (r<=acc){ next=j; break; } }
      visited.add(next); cur = next;
    }
    for (const v of visited) scores[v] += 1;
  };

  let delta = 1;
  while (delta > 1e-6) {
    prev = {...scores};
    for (let b=0;b<batch;b++){
      const start = peers[Math.floor(Math.random()*peers.length)];
      const steps = 1 + Math.floor(Math.random()*peers.length);
      walkOnce(start, steps);
    }
    // normalize after batch
    const s = peers.reduce((a,p)=>a+scores[p],0) || 1;
    for (const p of peers) scores[p] = scores[p]/s;
    delta = rmse();
  }
  return scores; // predictedTrust
}

export function pruneEdges(edges: Edge[], threshold=0): Edge[] {
    return edges.filter(e => e.r > threshold);
}

export function getEdgeWeights(edges: Edge[], from: string, to: string): number[] {
    return edges.filter(e => e.from === from && e.to === to).map(e => e.r);
}

export function averageEdgeWeights(edges: Edge[]): Record<string, Record<string, number>> {
    const edgeSums: Record<string, Record<string, { sum: number; count: number }>> = {};
    for (const edge of edges) {
        if (!edgeSums[edge.from]) edgeSums[edge.from] = {};
        if (!edgeSums[edge.from][edge.to]) edgeSums[edge.from][edge.to] = { sum: 0, count: 0 };
        edgeSums[edge.from][edge.to].sum += edge.r;
        edgeSums[edge.from][edge.to].count += 1;
    }
    const averagedEdges: Record<string, Record<string, number>> = {};
    for (const from in edgeSums) {
        averagedEdges[from] = {};
        for (const to in edgeSums[from]) {
            const { sum, count } = edgeSums[from][to];
            averagedEdges[from][to] = sum / count;
        }
    }
    return averagedEdges;
}

export function transposeEdgeMap(edgeMap: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
    const transposed: Record<string, Record<string, number>> = {};
    for (const from in edgeMap) {
        for (const to in edgeMap[from]) {   
            if (!transposed[to]) transposed[to] = {};
            transposed[to][from] = edgeMap[from][to];
        }
    }
    return transposed;
}


export function mergeEdgeMaps(edgeMaps: Record<string, Record<string, number>>[]): Record<string, Record<string, number>> {
    const merged: Record<string, Record<string, number>> = {};
    for (const edgeMap of edgeMaps) {
        for (const from in edgeMap) {
            if (!merged[from]) merged[from] = {};
            for (const to in edgeMap[from]) {
                merged[from][to] = edgeMap[from][to];
            }
        }
    }
    return merged;
}

// at heightdiff-1: commit
// const scores = SAWTrust(F);
// const blob = JSON.stringify(scores);
// const salt = crypto.getRandomValues(new Uint8Array(16));
// const commitment = hash256(concat(salt, utf8(blob)));
// submitSnapshot({ commitment }); // encrypted/committed scores

// // at heightdiff: reveal
// submitSnapshot({ scores, salt }); // peers verify hash matches commitment

// finality knob
//if (snapshot.acceptedParents < 11) return "pending"; // z = 11 rule


// Fuse with 2MEME (RealityNet concept)

/* 
how to fuse with 2MEME (concept → code) treat N as a local information potential. your runtime “climbs” that potential: route selection: prefer edges maximizing ΔN consensus gating: accept votes from peers with high N & low ML budget: allocate compute where if/when you adopt Day convolution / categorical composition: model each signal channel as an object in a monoidal category; your FFT/wavelet features become morphisms. define a functor that maps your feature objects into Reality’s CoCells; Day convolution composes features while preserving the monoidal structure. your seal/negentropic hash serves as a natural transformation carrying identity + ethics manifest across the functor (intent-preserving composition).
*/
//fuse with 2Meme (RealityNet) for multi-dimensional trust scoring
// use edge weights as inputs to multi-dimensional trust vectors
// combine with behavioral metrics from activity events for holistic trust assessment
// use edge weights as trust scores in weighted averaging of field states
// use edge weights to weight votes in consensus rounds
// use edge weights to weight peers in sampling for gossip, data requests, etc.

// use edge weights to adjust peer reputations over time based on agreement/disagreement
// use edge weights to identify clusters of agreement/disagreement in the network
// use edge weights to detect and mitigate Sybil attacks by identifying peers with consistently low agreement scores
// fuse with anomaly detection to flag peers with erratic or inconsistent edge weights
