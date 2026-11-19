---- MODULE IncompleteScan ----
VARIABLES scan, approval, sent
Init == /\ scan = "pending" /\ approval = "none" /\ sent = FALSE
Scan(s) == /\ ~sent /\ scan = "pending" /\ scan' = s /\ UNCHANGED <<approval, sent>>
Approve == /\ ~sent /\ scan = "match" /\ approval' = "current" /\ UNCHANGED <<scan, sent>>
Change == /\ ~sent /\ scan = "match" /\ approval = "current" /\ approval' = "stale" /\ UNCHANGED <<scan, sent>>
Send == /\ ~sent /\ (scan = "incomplete" \/ scan = "clear" \/ (scan = "match" /\ approval = "current")) /\ sent' = TRUE /\ UNCHANGED <<scan, approval>>
Next == (\E s \in {"clear", "match", "incomplete"}: Scan(s)) \/ Approve \/ Change \/ Send \/ UNCHANGED <<scan, approval, sent>>
CompleteBeforeSend == sent => scan \in {"clear", "match"}
CurrentDecision == (sent /\ scan = "match") => approval = "current"
====
