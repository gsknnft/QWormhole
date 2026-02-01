import json
import numpy as np


def shannon_entropy(p: np.ndarray) -> float:
    p = np.asarray(p, dtype=float)
    p = np.clip(p, 1e-12, None)
    p = p / p.sum()
    return -np.sum(p * np.log2(p))


def bounded_minimize(f, lo: float = 0.0, hi: float = 1.0, tol: float = 1e-5, max_iter: int = 200):
    # Simple golden-section search (no scipy dependency)
    phi = (1 + 5 ** 0.5) / 2
    invphi = 1 / phi
    invphi2 = invphi ** 2
    a, b = lo, hi
    h = b - a
    if h <= tol:
        return (a + b) / 2
    n = int(np.ceil(np.log(tol / h) / np.log(invphi)))
    c = a + invphi2 * h
    d = a + invphi * h
    fc = f(c)
    fd = f(d)
    for _ in range(min(n, max_iter)):
        if fc < fd:
            b, d, fd = d, c, fc
            h = invphi * h
            c = a + invphi2 * h
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            h = invphi * h
            d = a + invphi * h
            fd = f(d)
    return (a + b) / 2


def simulate_entropy_gravity(signal: np.ndarray, coupling_strength: float = 0.5):
    # Treat signal as a positive measure; normalize to a probability distribution
    signal = np.asarray(signal, dtype=float)
    signal = np.clip(signal, 1e-12, None)
    base_prob = signal / signal.sum()
    orig_ent = shannon_entropy(base_prob)

    def functional(x: float) -> float:
        # Apply coupling, enforce positivity, renormalize, then compute entropy
        coupled = signal + coupling_strength * x
        coupled = np.clip(coupled, 1e-12, None)
        p = coupled / coupled.sum()
        return shannon_entropy(p)

    x_star = bounded_minimize(functional, lo=-1.0, hi=1.0, tol=1e-5)
    final_ent = functional(x_star)
    epiplexity = orig_ent - final_ent  # Entropy reduction (negentropic gain)
    return {
        "orig_ent": orig_ent,
        "final_ent": final_ent,
        "epiplexity": epiplexity,
        "stable_state": float(x_star),
    }


# Test on bench-like trace (e.g., 20x5 matrix)
# np.random.seed(1)
# trace = np.random.rand(20, 5) ** 2  # skewed distribution
# result = simulate_entropy_gravity(trace.flatten())
# print(json.dumps(result, indent=2))
