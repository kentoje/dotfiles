---- MODULE AcceptedIsConfirmed ----
EXTENDS Naturals
VARIABLES valid, authorized, target, observed, jobsComplete, eligible, stopped, stopSends, sends, response, canceledObserved, confirmed, outcome
Init == /\ valid = FALSE /\ authorized = FALSE /\ target = "none" /\ observed = FALSE /\ jobsComplete = FALSE /\ eligible = FALSE /\ stopped = FALSE /\ stopSends = 0 /\ sends = 0 /\ response = "pending" /\ canceledObserved = FALSE /\ confirmed = FALSE /\ outcome = "pending"
Validate == /\ outcome = "pending" /\ valid' = TRUE /\ UNCHANGED <<authorized, target, observed, jobsComplete, eligible, stopped, stopSends, sends, response, canceledObserved, confirmed, outcome>>
Authorize == /\ outcome = "pending" /\ authorized' = TRUE /\ UNCHANGED <<valid, target, observed, jobsComplete, eligible, stopped, stopSends, sends, response, canceledObserved, confirmed, outcome>>
Resolve(t) == /\ outcome = "pending" /\ sends = 0 /\ target = "none" /\ target' = t /\ UNCHANGED <<valid, authorized, observed, jobsComplete, eligible, stopped, stopSends, sends, response, canceledObserved, confirmed, outcome>>
Observe(complete, hasEligible) == /\ outcome = "pending" /\ sends = 0 /\ ~observed /\ target = "selected" /\ observed' = TRUE /\ jobsComplete' = complete /\ eligible' = hasEligible /\ UNCHANGED <<valid, authorized, target, stopped, stopSends, sends, response, canceledObserved, confirmed, outcome>>
Send == /\ outcome = "pending" /\ valid /\ authorized /\ target = "selected" /\ observed /\ jobsComplete /\ eligible /\ ~stopped /\ sends = 0 /\ sends' = sends + 1 /\ UNCHANGED <<valid, authorized, target, observed, jobsComplete, eligible, stopped, stopSends, response, canceledObserved, confirmed, outcome>>
Respond(r) == /\ outcome = "pending" /\ sends = 1 /\ response = "pending" /\ response' = r /\ UNCHANGED <<valid, authorized, target, observed, jobsComplete, eligible, stopped, stopSends, sends, canceledObserved, confirmed, outcome>>
ObserveCanceled == /\ outcome = "pending" /\ sends = 1 /\ response = "accepted" /\ canceledObserved' = TRUE /\ UNCHANGED <<valid, authorized, target, observed, jobsComplete, eligible, stopped, stopSends, sends, response, confirmed, outcome>>
Confirm == /\ outcome = "pending" /\ response = "accepted" /\ confirmed' = TRUE /\ UNCHANGED <<valid, authorized, target, observed, jobsComplete, eligible, stopped, stopSends, sends, response, canceledObserved, outcome>>
Stop == /\ outcome = "pending" /\ ~stopped /\ stopped' = TRUE /\ stopSends' = sends /\ UNCHANGED <<valid, authorized, target, observed, jobsComplete, eligible, sends, response, canceledObserved, confirmed, outcome>>
NoChange == /\ outcome = "pending" /\ valid /\ target = "selected" /\ observed /\ jobsComplete /\ ~eligible /\ sends = 0 /\ ~stopped /\ outcome' = "no_change" /\ UNCHANGED <<valid, authorized, target, observed, jobsComplete, eligible, stopped, stopSends, sends, response, canceledObserved, confirmed>>
Finalize == /\ outcome = "pending" /\ outcome' = (IF sends = 1 THEN (IF response = "accepted" THEN "accepted" ELSE IF response = "rejected" THEN "error" ELSE "indeterminate") ELSE (IF stopped THEN "cancelled" ELSE "blocked")) /\ UNCHANGED <<valid, authorized, target, observed, jobsComplete, eligible, stopped, stopSends, sends, response, canceledObserved, confirmed>>
Next == Validate \/ Authorize \/ (\E t \in {"selected", "other"}: Resolve(t)) \/ (\E complete \in BOOLEAN: \E hasEligible \in BOOLEAN: Observe(complete, hasEligible)) \/ Send \/ (\E r \in {"accepted", "rejected", "lost"}: Respond(r)) \/ ObserveCanceled \/ Confirm \/ Stop \/ NoChange \/ Finalize \/ UNCHANGED <<valid, authorized, target, observed, jobsComplete, eligible, stopped, stopSends, sends, response, canceledObserved, confirmed, outcome>>
BoundTarget == sends > 0 => (valid /\ authorized /\ target = "selected" /\ observed)
SingleSend == sends <= 1
StopDispatch == stopped => sends = stopSends
HonestUnknown == (sends = 1 /\ response \in {"pending", "lost"} /\ outcome # "pending") => outcome = "indeterminate"
HonestConfirmation == confirmed => (response = "accepted" /\ canceledObserved)
EvidenceForNoChange == outcome = "no_change" => (jobsComplete /\ ~eligible /\ sends = 0)
====
