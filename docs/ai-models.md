# AI models

**Build 1 contains no AI or machine-learning models.** The AI & Autonomous Intelligence Lab is planned for Builds 8–10 and is shown in the application as "Planned", with no calculations.

This document fixes the rules that AI work must follow when it starts.

## 1. Scope

Civilian and benign tasks only: perception for mapping, inspection and environmental monitoring; state estimation; anomaly detection and predictive maintenance; benign navigation (safe paths, landing, return-to-home) in simulation; education. No targeting, tracking of people for harm, weapon-related or attack functions. Learned policies are never connected to physical flight controls.

## 2. Planned capabilities

| Area | First approach | Build |
|---|---|---|
| Computer vision | ONNX models (classification, detection, segmentation, super-resolution, quality assessment) through ONNX Runtime Web (WASM/WebGPU); user images and virtual camera frames | 8 |
| Sensor fusion | Complementary filter and Kalman filter first; EKF, UKF and particle filter next; deterministic JavaScript with noise, bias, drift, dropout and timing-error injection | 8 |
| Predictive maintenance / anomaly detection | Labelled synthetic data generators; statistical and lightweight learned detectors; false-positive analysis | 8 |
| Path planning | A* and Dijkstra on grids, then RRT/RRT*, potential fields; comparison of path length, smoothness, computation time, simulated energy | 9 |
| Reinforcement learning | Tabular Q-learning on a benign task (hover/altitude hold, reaching a landing zone), then policy-gradient/PPO where practical | 9 |
| Edge AI | Model size, parameters, operations and in-browser latency measurements; quantisation, structured pruning and distillation exercises | 9 |
| Digital-twin integration | AI modules consume simulated sensor streams and return outputs for display only | 10 |

## 3. Data and result labelling

- Every dataset is labelled **synthetic**, **simulated** or **measured**, with its generator, seed and parameters or its source and licence.
- Metrics (accuracy, precision, recall, F1, mAP, latency, FPS, memory, energy) state the dataset, conditions and how they were obtained.
- **Device benchmarks are never invented.** Figures are either measured on the user's own device/browser (labelled "measured on this device") or taken from a cited source with its conditions. Anything else is an estimate with its method shown.

## 4. Resource and capability rules

- Capability checks for WebGPU, WebAssembly SIMD/threads and available memory, with graceful fallbacks.
- Training runs in Web Workers with stated limits on dataset size, epochs and memory, and can be cancelled.
- The optional local Python/PyTorch service (Build 9) is opt-in, runs on `localhost`, and is documented with its API; the core application never depends on it or on any external AI API.
