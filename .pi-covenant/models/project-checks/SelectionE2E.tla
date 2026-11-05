---- MODULE SelectionE2E ----
VARIABLES available, covered, configured, explicit, selected, complete
Kinds == {"types", "unit", "e2e"}
Init == /\ available \in SUBSET Kinds /\ covered \in SUBSET available /\ configured \in SUBSET available /\ explicit \in BOOLEAN /\ selected = {} /\ complete = FALSE
Select == /\ ~complete /\ selected' = (IF explicit THEN configured ELSE available) /\ complete' = TRUE /\ UNCHANGED <<available, covered, configured, explicit>>
Next == Select \/ UNCHANGED <<available, covered, configured, explicit, selected, complete>>
NoOmittedLocal == (complete /\ ~explicit) => (available \ {"e2e"}) \subseteq selected
ExplicitWins == (complete /\ explicit) => selected = configured
NoImplicitE2E == (complete /\ ~explicit /\ "e2e" \notin covered) => "e2e" \notin selected
====
