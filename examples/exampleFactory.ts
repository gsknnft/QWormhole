import example from '../examples/entropy_mesh_example.json';
const author = "gsknnft";
const date = "2025-12-04";
const version = "1.0";

type Mode = 'macro' | 'defensive' | 'balanced';

export interface MeshExample {
  metadata: {
    description: string;
    version: string;
    author: string;
    date: string;
  };
  mesh: {
    nodes: number;
    edges: [number, number][];
  };
  initial_state: {
    probability_distributions: {
      [edge: string]: number[];
    };
  };
  simulation_parameters: {
    time_steps: number;
    mode: Mode;
    delta_t: number;
    entropy_tolerance: number;
  };
  expected_metrics: {
    initial_mesh_negentropy: number;
    initial_coherence: number;
    description: string;
  };
  policy_thresholds: {
    macro_threshold: number;
    defensive_threshold: number;
    description: string;
  };
};

function coerceEdges(edges: any): [number, number][] {
  if (!Array.isArray(edges)) return [];
  return edges
    .filter((e: any) => Array.isArray(e) && e.length === 2 && typeof e[0] === "number" && typeof e[1] === "number")
    .map((e: any) => [e[0], e[1]] as [number, number]);
}

export const entropyMeshExample: MeshExample =
  (example && {
    ...example,
    mesh: {
      ...example.mesh,
      edges: coerceEdges(example.mesh?.edges)
    }
  }) as MeshExample ?? {

    metadata: {
    description: "Example entropy mesh data for NCF simulation testing",
    version: "1.0",
    author,
    date
  },
  mesh: {
    nodes: 5,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 0],
      [4, 1]
    ]
  },
  initial_state: {
    probability_distributions: {
      "[0, 1]": [0.15, 0.12, 0.08, 0.10, 0.11, 0.09, 0.13, 0.07, 0.08, 0.07],
      "[1, 2]": [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10],
      "[2, 3]": [0.05, 0.15, 0.20, 0.15, 0.10, 0.08, 0.07, 0.06, 0.08, 0.06],
      "[3, 4]": [0.18, 0.14, 0.11, 0.09, 0.08, 0.10, 0.09, 0.08, 0.07, 0.06],
      "[4, 0]": [0.12, 0.11, 0.10, 0.09, 0.11, 0.10, 0.09, 0.10, 0.09, 0.09],
      "[0, 2]": [0.08, 0.08, 0.12, 0.14, 0.11, 0.09, 0.10, 0.09, 0.10, 0.09],
      "[1, 3]": [0.20, 0.15, 0.10, 0.08, 0.09, 0.08, 0.08, 0.08, 0.07, 0.07],
      "[2, 4]": [0.09, 0.09, 0.09, 0.10, 0.10, 0.11, 0.11, 0.10, 0.11, 0.10],
      "[3, 0]": [0.11, 0.10, 0.11, 0.10, 0.09, 0.10, 0.09, 0.10, 0.10, 0.10],
      "[4, 1]": [0.13, 0.12, 0.11, 0.10, 0.09, 0.09, 0.09, 0.09, 0.09, 0.09]
    }
  },
  simulation_parameters: {
    time_steps: 10,
    mode: "macro",
    delta_t: 1.0,
    entropy_tolerance: 0.01
  },
  expected_metrics: {
    initial_mesh_negentropy: 0.68,
    initial_coherence: 0.85,
    description: "These are approximate expected values for validation"
  },
  policy_thresholds: {
    macro_threshold: 0.8,
    defensive_threshold: 0.3,
    description: "N > 0.8 => macro, N < 0.3 => defensive, otherwise => balanced"
  }
}


// function sampleCreator<T>(items: T[]): () => T {
//   let index = 0;
//   return () => {
//     const item = items[index];
//     index = (index + 1) % items.length;
//     return item;
//   }
// }

// export const getExampleMesh = sampleCreator<MeshExample>([
//   entropyMeshExample,
// ]);

