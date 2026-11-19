---- MODULE Write ----
EXTENDS Naturals
VARIABLES ready, stopped, sends, response, outcome
Init == /\ ready = FALSE /\ stopped = FALSE /\ sends = 0 /\ response = "pending" /\ outcome = "pending"
Authorize == /\ ~stopped /\ sends = 0 /\ ready' = TRUE /\ UNCHANGED <<stopped, sends, response, outcome>>
Stop == /\ sends = 0 /\ stopped' = TRUE /\ UNCHANGED <<ready, sends, response, outcome>>
Send == /\ ready /\ ~stopped /\ sends = 0 /\ sends' = sends + 1 /\ UNCHANGED <<ready, stopped, response, outcome>>
Respond(r) == /\ sends = 1 /\ response = "pending" /\ response' = r /\ UNCHANGED <<ready, stopped, sends, outcome>>
Finish == /\ sends = 1 /\ response # "pending" /\ outcome' = (IF response = "view" THEN "ok" ELSE IF response = "ack" THEN "partial" ELSE IF response = "lost" THEN "indeterminate" ELSE "error") /\ UNCHANGED <<ready, stopped, sends, response>>
Next == Authorize \/ Stop \/ Send \/ (\E r \in {"view", "ack", "lost", "rejected"}: Respond(r)) \/ Finish \/ UNCHANGED <<ready, stopped, sends, response, outcome>>
AuthorizedOnce == sends > 0 => (ready /\ ~stopped /\ sends = 1)
HonestView == outcome = "ok" => response = "view"
KeepCommit == (response = "ack" /\ outcome # "pending") => outcome = "partial"
HonestLoss == (response = "lost" /\ outcome # "pending") => outcome = "indeterminate"
====
