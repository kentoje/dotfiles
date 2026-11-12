---- MODULE InvocationUnvalidated ----
EXTENDS Naturals
VARIABLES valid, resolved, stopped, dispatched, stopDispatch, outcome, reported, success
Init == /\ valid = FALSE /\ resolved = FALSE /\ stopped = FALSE /\ dispatched = FALSE /\ stopDispatch = FALSE /\ outcome = "pending" /\ reported = FALSE /\ success = FALSE
Validate == /\ ~stopped /\ ~reported /\ valid' = TRUE /\ UNCHANGED <<resolved, stopped, dispatched, stopDispatch, outcome, reported, success>>
Resolve == /\ valid /\ ~stopped /\ ~reported /\ resolved' = TRUE /\ UNCHANGED <<valid, stopped, dispatched, stopDispatch, outcome, reported, success>>
Dispatch == /\ ~stopped /\ ~dispatched /\ ~reported /\ dispatched' = TRUE /\ UNCHANGED <<valid, resolved, stopped, stopDispatch, outcome, reported, success>>
Stop == /\ ~stopped /\ ~reported /\ stopped' = TRUE /\ stopDispatch' = dispatched /\ UNCHANGED <<valid, resolved, dispatched, outcome, reported, success>>
Complete(result) == /\ dispatched /\ outcome = "pending" /\ ~reported /\ outcome' = result /\ UNCHANGED <<valid, resolved, stopped, dispatched, stopDispatch, reported, success>>
Report == /\ ~reported /\ reported' = TRUE /\ success' = (dispatched /\ outcome = "ok") /\ UNCHANGED <<valid, resolved, stopped, dispatched, stopDispatch, outcome>>
Next == Validate \/ Resolve \/ Dispatch \/ Stop \/ (\E result \in {"ok", "failed", "partial", "cancelled"}: Complete(result)) \/ Report \/ UNCHANGED <<valid, resolved, stopped, dispatched, stopDispatch, outcome, reported, success>>
ValidatedDispatch == dispatched => (valid /\ resolved)
NoDispatchAfterStop == stopped => dispatched = stopDispatch
TruthfulResult == success => (reported /\ dispatched /\ outcome = "ok")
====
