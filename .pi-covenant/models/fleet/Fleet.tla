---- MODULE Fleet ----
VARIABLES selection, a, b, outcome
Init == /\ selection = "pending" /\ a = "pending" /\ b = "pending" /\ outcome = "pending"
Select(s) == /\ selection = "pending" /\ selection' = s /\ UNCHANGED <<a,b,outcome>>
ReadA(r) == /\ selection = "valid" /\ a = "pending" /\ a' = r /\ UNCHANGED <<selection,b,outcome>>
ReadB(r) == /\ selection = "valid" /\ b = "pending" /\ b' = r /\ UNCHANGED <<selection,a,outcome>>
Finish == /\ a # "pending" /\ b # "pending" /\ outcome' = (IF a = "ok" /\ b = "ok" THEN "ok" ELSE IF a = "error" /\ b = "error" THEN "error" ELSE "partial") /\ UNCHANGED <<selection,a,b>>
Next == (\E s \in {"valid","unknown"} : Select(s)) \/ (\E r \in {"ok","partial","error"} : ReadA(r) \/ ReadB(r)) \/ Finish \/ UNCHANGED <<selection,a,b,outcome>>
ValidatedSelection == (a # "pending" \/ b # "pending") => selection = "valid"
TruthfulAggregate == outcome = "ok" => (a = "ok" /\ b = "ok")
====
