Throwaway self-signed certificate used ONLY by webapps-ipc.test.ts to run a
local TLS server that the status probe must accept despite the certificate
being untrusted. Not a secret — never use it for anything real.
