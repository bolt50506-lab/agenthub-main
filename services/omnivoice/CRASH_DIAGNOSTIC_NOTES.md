# OmniVoice crash diagnostics

The native engine is supervised by `launcher.py`. If the child exits unexpectedly, the launcher logs its exit code/signal and Linux cgroup memory counters before restarting it. This is intentionally diagnostic-only and does not change synthesis behavior.
