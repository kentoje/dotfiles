---- MODULE DuplicateRecord ----
EXTENDS Naturals
VARIABLES mode, items, result
Init == /\ mode = "none" /\ items = 0 /\ result = "pending"
Request(m) == /\ mode = "none" /\ mode' = m /\ UNCHANGED <<items,result>>
Preview == /\ mode = "dry" /\ result' = "preview" /\ UNCHANGED <<mode,items>>
Record == /\ mode = "write" /\ items < 2 /\ items' = items+1 /\ result' = "created" /\ UNCHANGED mode
Link == /\ mode = "write" /\ items = 1 /\ result' = "linked" /\ UNCHANGED <<mode,items>>
Next == (\E m \in {"dry","write"} : Request(m)) \/ Preview \/ Record \/ Link \/ UNCHANGED <<mode,items,result>>
ExplicitWrite == items > 0 => mode = "write"
UniqueProposal == items <= 1
====
