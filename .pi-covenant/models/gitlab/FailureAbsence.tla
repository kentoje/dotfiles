---- MODULE FailureAbsence ----
EXTENDS Naturals
VARIABLES pages, more, malformed, matched, absent, finished
Init == /\ pages = 0 /\ more = TRUE /\ malformed = FALSE /\ matched = FALSE /\ absent = FALSE /\ finished = FALSE
Read(hasMore, found) == /\ ~finished /\ ~malformed /\ more /\ pages < 2 /\ pages' = pages + 1 /\ more' = hasMore /\ matched' = (matched \/ found) /\ UNCHANGED <<malformed, absent, finished>>
Fail == /\ ~finished /\ malformed' = TRUE /\ UNCHANGED <<pages, more, matched, absent, finished>>
Finish == /\ ~finished /\ finished' = TRUE /\ absent' = (pages > 0 /\ ~more /\ ~matched) /\ UNCHANGED <<pages, more, malformed, matched>>
Next == (\E hasMore \in BOOLEAN: \E found \in BOOLEAN: Read(hasMore, found)) \/ Fail \/ Finish \/ UNCHANGED <<pages, more, malformed, matched, absent, finished>>
HonestAbsence == absent => (finished /\ pages > 0 /\ ~more /\ ~malformed /\ ~matched)
====
