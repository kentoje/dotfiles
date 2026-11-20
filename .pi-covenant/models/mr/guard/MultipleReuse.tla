---- MODULE MultipleReuse ----
VARIABLES explicit, context, lookup, policy, decision
Init == /\ explicit = FALSE /\ context = FALSE /\ lookup = "pending" /\ policy = FALSE /\ decision = "pending"
Select == /\ ~explicit /\ explicit' = TRUE /\ context' = TRUE /\ UNCHANGED <<lookup,policy,decision>>
Lookup(l) == /\ explicit /\ context /\ lookup = "pending" /\ lookup' = l /\ UNCHANGED <<explicit,context,policy,decision>>
Policy == /\ lookup = "zero" /\ decision = "pending" /\ policy' = TRUE /\ UNCHANGED <<explicit,context,lookup,decision>>
Allow == /\ explicit /\ context /\ lookup = "zero" /\ policy /\ decision = "pending" /\ decision' = "allow" /\ UNCHANGED <<explicit,context,lookup,policy>>
Reuse == /\ explicit /\ context /\ lookup \in {"one","many"} /\ decision = "pending" /\ decision' = "reuse" /\ UNCHANGED <<explicit,context,lookup,policy>>
Next == Select \/ (\E l \in {"zero","one","many","incomplete"} : Lookup(l)) \/ Policy \/ Allow \/ Reuse \/ UNCHANGED <<explicit,context,lookup,policy,decision>>
ExplicitGuard == decision # "pending" => (explicit /\ context)
CheckedAbsence == decision = "allow" => lookup = "zero"
ReusedExisting == decision = "reuse" => lookup = "one"
CheckedPolicy == decision = "allow" => policy
====
