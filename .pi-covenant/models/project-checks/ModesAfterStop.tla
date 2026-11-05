---- MODULE ModesAfterStop ----
EXTENDS Naturals
VARIABLES states, keepGoing, cancelled, started, cancelStarted, finished, passed
Terminal == {"passed", "failed", "timed_out", "unavailable"}
AllComplete == states[1] \in Terminal /\ states[2] \in Terminal
Init == /\ states = <<"pending", "pending">> /\ keepGoing \in BOOLEAN /\ cancelled = FALSE /\ started = 0 /\ cancelStarted = 0 /\ finished = FALSE /\ passed = FALSE
Start(i) == /\ ~finished /\ states[i] = "pending" /\ (i = 1 \/ states[1] = "passed" \/ (keepGoing /\ states[1] \in Terminal)) /\ states' = [states EXCEPT ![i] = "running"] /\ started' = started + 1 /\ UNCHANGED <<keepGoing, cancelled, cancelStarted, finished, passed>>
Complete(i, outcome) == /\ ~finished /\ states[i] = "running" /\ states' = [states EXCEPT ![i] = outcome] /\ UNCHANGED <<keepGoing, cancelled, started, cancelStarted, finished, passed>>
Cancel == /\ ~finished /\ ~cancelled /\ cancelled' = TRUE /\ cancelStarted' = started /\ UNCHANGED <<states, keepGoing, started, finished, passed>>
Finalize == /\ ~finished /\ (cancelled \/ ~keepGoing \/ AllComplete) /\ finished' = TRUE /\ passed' = (~cancelled /\ states[1] = "passed" /\ states[2] = "passed") /\ UNCHANGED <<states, keepGoing, cancelled, started, cancelStarted>>
Next == (\E i \in {1, 2}: Start(i)) \/ (\E i \in {1, 2}: \E outcome \in Terminal: Complete(i, outcome)) \/ Cancel \/ Finalize \/ UNCHANGED <<states, keepGoing, cancelled, started, cancelStarted, finished, passed>>
TruthfulCompletion == passed => (finished /\ ~cancelled /\ states[1] = "passed" /\ states[2] = "passed")
NoDispatchAfterCancel == cancelled => started = cancelStarted
CompleteWhenContinuing == (finished /\ keepGoing /\ ~cancelled) => AllComplete
====
