---- MODULE InvalidSuccess ----
EXTENDS Naturals
VARIABLES targetReady, credentialReady, stopped, stopSends, sends, last, complete, success, finished
Init == /\ targetReady = FALSE /\ credentialReady = FALSE /\ stopped = FALSE /\ stopSends = 0 /\ sends = 0 /\ last = "none" /\ complete = FALSE /\ success = FALSE /\ finished = FALSE
Resolve == /\ ~finished /\ ~stopped /\ targetReady' = TRUE /\ UNCHANGED <<credentialReady, stopped, stopSends, sends, last, complete, success, finished>>
Credential == /\ ~finished /\ ~stopped /\ targetReady /\ credentialReady' = TRUE /\ UNCHANGED <<targetReady, stopped, stopSends, sends, last, complete, success, finished>>
Send == /\ ~finished /\ targetReady /\ credentialReady /\ ~stopped /\ sends < 2 /\ (sends = 0 \/ last = "transient") /\ sends' = sends + 1 /\ last' = "pending" /\ complete' = FALSE /\ UNCHANGED <<targetReady, credentialReady, stopped, stopSends, success, finished>>
Receive(result) == /\ ~finished /\ sends > 0 /\ last = "pending" /\ last' = result /\ complete' = (result = "valid") /\ UNCHANGED <<targetReady, credentialReady, stopped, stopSends, sends, success, finished>>
Stop == /\ ~finished /\ ~stopped /\ stopped' = TRUE /\ stopSends' = sends /\ UNCHANGED <<targetReady, credentialReady, sends, last, complete, success, finished>>
Finish == /\ ~finished /\ finished' = TRUE /\ success' = (sends > 0 /\ ~stopped) /\ UNCHANGED <<targetReady, credentialReady, stopped, stopSends, sends, last, complete>>
Next == Resolve \/ Credential \/ Send \/ (\E result \in {"valid", "invalid", "transient", "rejected"}: Receive(result)) \/ Stop \/ Finish \/ UNCHANGED <<targetReady, credentialReady, stopped, stopSends, sends, last, complete, success, finished>>
BoundedReads == sends <= 2
HostBeforeRead == sends > 0 => (targetReady /\ credentialReady)
NoStoppedDispatch == stopped => sends = stopSends
TruthfulRead == success => (finished /\ sends > 0 /\ last = "valid" /\ complete /\ ~stopped)
====
