---- MODULE Checks ----
EXTENDS Naturals
VARIABLES states, cancelled, started, cancelStarted, finished, passed
Init == /\ states = <<"pending", "pending">> /\ cancelled = FALSE /\ started = 0 /\ cancelStarted = 0 /\ finished = FALSE /\ passed = FALSE
Start(i) == /\ ~finished /\ ~cancelled /\ states[i] = "pending" /\ (i = 1 \/ states[1] = "passed") /\ states' = [states EXCEPT ![i] = "running"] /\ started' = started + 1 /\ UNCHANGED <<cancelled, cancelStarted, finished, passed>>
Complete(i, outcome) == /\ ~finished /\ states[i] = "running" /\ states' = [states EXCEPT ![i] = outcome] /\ UNCHANGED <<cancelled, started, cancelStarted, finished, passed>>
Cancel == /\ ~finished /\ ~cancelled /\ cancelled' = TRUE /\ cancelStarted' = started /\ UNCHANGED <<states, started, finished, passed>>
Finalize == /\ ~finished /\ finished' = TRUE /\ passed' = (~cancelled /\ states[1] = "passed" /\ states[2] = "passed") /\ UNCHANGED <<states, cancelled, started, cancelStarted>>
Next == (\E i \in {1, 2}: Start(i)) \/ (\E i \in {1, 2}: \E outcome \in {"passed", "failed", "timed_out", "unavailable"}: Complete(i, outcome)) \/ Cancel \/ Finalize \/ UNCHANGED <<states, cancelled, started, cancelStarted, finished, passed>>
NoFalsePass == passed => (finished /\ ~cancelled /\ states[1] = "passed" /\ states[2] = "passed")
NoDispatchAfterCancel == cancelled => started = cancelStarted
====
