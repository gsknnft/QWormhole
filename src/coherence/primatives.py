# from typing import Dict, List, Tuple 
# import numpy as np
# import pywt # for wavelet entropy from scipy.signal 
# import welch # for spectral decomp class CoherencePrimitives:

# class CoherencePrimitives: 
#     def __init__(self, m_min=0.2, v_max=0.05, r_min=0.3, history_size=50): 
#         self.m_min = m_min 
#         self.v_max = v_max 
#         self.r_min = r_min 
#         self.history: List[Dict[str, float]] = [] # rolling window 
#     def sample(self) -> Dict[str, float]: 
#         # Ambient sense: replace with your ASIS hooks (latency, queues, errors) 
#         # Example: simulated or from runtime telemetry 
#         latency_dist = np.random.normal(10, 2, 100) # ms 
#         queue_slope = 0.1 # depth/sec 
#         error_entropy = -np.sum(np.array([0.9, 0.1]) * np.log([0.9, 0.1])) # bits 
#         phase_skew = 0.05 # rad 
#         return {'latency_var': np.var(latency_dist), 'queue_slope': queue_slope, 'error_entropy': error_entropy, 'phase_skew': phase_skew} 
#     def estimate(self, sample: Dict) -> Tuple[float, float, float]: 
#         # M: coherence margin (e.g., 1 - normalized entropy) 
#         coeffs = pywt.wavedec(sample['latency_var'], 'db1') # wavelet decomp 
#         wavelet_ent = sum(-p * np.log(p + 1e-10) for p in np.abs(coeffs[0]) / sum(np.abs(coeffs[0]))) 
#         M = 1 - (wavelet_ent / np.log(2)) # normalize to [0,1] 
#         # V: drift (e.g., d/dt via finite diff on history) 
#         if self.history: 
#             prev_M = self.history[-1]['M'] 
#             V = (M - prev_M) / 1.0 # assume Δt=1 
#         else: 
#             V = 0.0 
#         # R: reserve (e.g., COM-like projection) 
#         f, psd = welch(sample['latency_var']) # FFT power spectrum 
#         snr = 10 * np.log10(np.mean(psd) / np.std(psd)) # proxy 
#         R = min(1, max(0, snr / 20)) # normalize 
#         self.history.append({'M': M, 'V': V, 'R': R, 'sample': sample}) 
#         if len(self.history) > 50: 
#             self.history.pop(0) 
#         return M, V, R 
#     def adapt(self, M: float, V: float, R: float, current_C: Dict) -> Dict: 
#         new_C = current_C.copy() 
#         if M < self.m_min or (V < 0 and M / abs(V) < 5): # horizon <5 units 
#             new_C['batch_size'] = max(1, new_C['batch_size'] // 2) 
#             new_C['redundancy'] += 0.2 
#         # Rephase: reset phase if skew high 
#         if self.history[-1]['sample']['phase_skew'] > 0.1: 
#             new_C['phase_offset'] = 0.0 # resync 
#         elif M > 0.8 and abs(V) < 0.01: # stable high margin 
#             new_C['batch_size'] += 1 
#         return new_C # damped changes