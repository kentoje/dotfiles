---- MODULE Reply ----
EXTENDS Naturals
VARIABLES authorized, want, correct, posted, reply, resolved, outcome
Init == /\ authorized = FALSE /\ want = FALSE /\ correct = FALSE /\ posted = 0 /\ reply = "pending" /\ resolved = 0 /\ outcome = "pending"
Prepare(w,c) == /\ posted = 0 /\ ~authorized /\ authorized' = TRUE /\ want' = w /\ correct' = c /\ UNCHANGED <<posted,reply,resolved,outcome>>
Post == /\ authorized /\ correct /\ posted = 0 /\ posted' = posted + 1 /\ UNCHANGED <<authorized,want,correct,reply,resolved,outcome>>
Observe(r) == /\ posted = 1 /\ reply = "pending" /\ reply' = r /\ UNCHANGED <<authorized,want,correct,posted,resolved,outcome>>
Resolve == /\ want /\ reply = "ack" /\ resolved = 0 /\ outcome = "pending" /\ resolved' = 1 /\ UNCHANGED <<authorized,want,correct,posted,reply,outcome>>
FailResolution == /\ resolved = 1 /\ outcome = "pending" /\ outcome' = "partialWithId" /\ UNCHANGED <<authorized,want,correct,posted,reply,resolved>>
Next == (\E w \in BOOLEAN : \E c \in BOOLEAN : Prepare(w,c)) \/ Post \/ (\E r \in {"ack","lost","rejected"} : Observe(r)) \/ Resolve \/ FailResolution \/ UNCHANGED <<authorized,want,correct,posted,reply,resolved,outcome>>
BoundReply == posted > 0 => (authorized /\ correct /\ posted = 1)
SeparateResolve == resolved > 0 => want
ReplyFirst == resolved > 0 => reply = "ack"
KeepReply == outcome # "pending" => outcome = "partialWithId"
====
