import { Button } from '@/app/components/ui/button';

import { AlertTriangle, Check, Info, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';

/**
 * Input Validation Example Dialog
 * -------------------------------
 * A reference implementation showing how to do good input validation on the
 * kinds of values we deal with in the Launchpad: IP addresses, IP addresses
 * with a CIDR suffix, and domain names.
 *
 * The pattern demonstrated here:
 *   1. Every field has a pure `validate` function that returns either `null`
 *      (valid) or a short, human-readable error string.
 *   2. Validation runs as the user types, but the error is only *shown* after
 *      the field has been "touched" (blurred once) so we don't yell at the user
 *      before they've had a chance to finish typing.
 *   3. Errors are shown in-line, in red, with a clear reason.
 *   4. Every field carries a persistent hint/example that encourages the
 *      correct format, and a green check appears once the value is valid.
 *
 * Copy `ValidatedField` and the validators below into your own dialogs.
 */

// ---------------------------------------------------------------------------
// Validators — each returns null when valid, or an error message when not.
// Keep these pure and side-effect free so they are trivial to unit test.
// ---------------------------------------------------------------------------

interface ValidationResult {
  error: string | null;
}

function validateIpv4 (value: string): ValidationResult {
  const trimmed = value.trim();
  if (trimmed === '') return { error: 'An IPv4 address is required.' };

  const parts = trimmed.split('.');
  if (parts.length !== 4) {
    return { error: 'An IPv4 address must have exactly 4 octets separated by dots.' };
  }

  for (const part of parts) {
    // Reject empty octets, non-digits, and leading zeros like "01".
    if (!/^\d{1,3}$/.test(part)) {
      return { error: `"${part}" is not a valid octet — use numbers 0-255.` };
    }
    if (part.length > 1 && part.startsWith('0')) {
      return { error: `"${part}" has a leading zero — write octets as 0-255 without padding.` };
    }
    const num = Number(part);
    if (num > 255) {
      return { error: `"${part}" is out of range — each octet must be between 0 and 255.` };
    }
  }

  return { error: null };
}

function validateIpv4Cidr (value: string): ValidationResult {
  const trimmed = value.trim();
  if (trimmed === '') return { error: 'A network in CIDR notation is required.' };

  if (!trimmed.includes('/')) {
    return { error: 'Missing prefix length — CIDR notation looks like 10.0.0.0/24.' };
  }

  const [address, prefix, ...rest] = trimmed.split('/');
  if (rest.length > 0) {
    return { error: 'A CIDR value must contain exactly one "/" separator.' };
  }

  const ipResult = validateIpv4(address);
  if (ipResult.error) return ipResult;

  if (!/^\d{1,2}$/.test(prefix)) {
    return { error: `"/${prefix}" is not a valid prefix — use a number from 0 to 32.` };
  }
  const prefixNum = Number(prefix);
  if (prefixNum > 32) {
    return { error: `"/${prefix}" is out of range — the prefix length must be 0-32.` };
  }

  return { error: null };
}

function validateDomain (value: string): ValidationResult {
  const trimmed = value.trim();
  if (trimmed === '') return { error: 'A domain name is required.' };

  if (trimmed.length > 253) {
    return { error: 'A domain name cannot be longer than 253 characters.' };
  }
  if (trimmed.includes('..')) {
    return { error: 'A domain cannot contain empty labels (".." is not allowed).' };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { error: 'Enter the host only — drop the "http://" or "https://" scheme.' };
  }
  if (trimmed.includes('/')) {
    return { error: 'Enter the host only — remove any path or trailing slash.' };
  }

  const labels = trimmed.split('.');
  if (labels.length < 2) {
    return { error: 'Include a top-level domain, e.g. example.com.' };
  }

  for (const label of labels) {
    if (label.length === 0) {
      return { error: 'A domain cannot start or end with a dot.' };
    }
    if (label.length > 63) {
      return { error: `The label "${label}" is too long — labels max out at 63 characters.` };
    }
    if (!/^[a-zA-Z0-9-]+$/.test(label)) {
      return { error: `"${label}" contains invalid characters — use only letters, numbers, and hyphens.` };
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return { error: `The label "${label}" cannot start or end with a hyphen.` };
    }
  }

  const tld = labels[labels.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(tld)) {
    return { error: `"${tld}" is not a valid top-level domain — it must be at least two letters.` };
  }

  return { error: null };
}

// ---------------------------------------------------------------------------
// Reusable validated field. This is the piece worth copying into other dialogs.
// ---------------------------------------------------------------------------

interface ValidatedFieldProps {
  label: string;
  placeholder: string;
  /** Persistent guidance shown under the field to encourage the right format. */
  hint: string;
  validate: (value: string) => ValidationResult;
  value: string;
  onChange: (value: string) => void;
}

function ValidatedField ({ label, placeholder, hint, validate, value, onChange }: ValidatedFieldProps) {
  const [touched, setTouched] = useState(false);

  // Recompute validity on every render — validators are cheap and pure.
  const { error } = useMemo(() => validate(value), [validate, value]);

  const isEmpty = value.trim() === '';
  const showError = touched && error !== null;
  const showSuccess = touched && !error && !isEmpty;

  // Swap the border/ring colour based on validation state so the field itself
  // communicates status, not just the message underneath it.
  const stateClasses = showError
    ? 'border-red-500/60 focus:ring-red-500/30 focus:border-red-500/70'
    : showSuccess
      ? 'border-green-500/60 focus:ring-green-500/30 focus:border-green-500/70'
      : 'border-border-light/20 focus:ring-primary/30 focus:border-primary/50';

  return (
    <div className='space-y-1.5'>
      <label className='block text-sm font-medium text-white/90'>{label}</label>

      <div className='relative'>
        <input
          type='text'
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showError}
          className={`w-full pl-3 pr-10 py-2.5 bg-dark-300/50 border rounded-lg text-sm text-white placeholder:text-text-light/40 focus:outline-none focus:ring-2 transition-all ${stateClasses}`}
        />
        {/* Status icon on the right edge of the input. */}
        {showError && (
          <AlertTriangle className='absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400' />
        )}
        {showSuccess && (
          <Check className='absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400' />
        )}
      </div>

      {/* Error takes priority; otherwise show the persistent hint so the user
          always has an example of the correct format in front of them. */}
      {showError
        ? (
          <p className='flex items-start gap-1.5 text-xs text-red-400'>
            <AlertTriangle className='w-3.5 h-3.5 flex-shrink-0 mt-0.5' />
            <span>{error}</span>
          </p>
          )
        : (
          <p className='flex items-start gap-1.5 text-xs text-text-light/55'>
            <Info className='w-3.5 h-3.5 flex-shrink-0 mt-0.5' />
            <span>{hint}</span>
          </p>
          )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The dialog itself. Mirrors the styling/structure of yara-rules-dialog.tsx.
// ---------------------------------------------------------------------------

interface InputValidationDialogProps {
  open: boolean;
  onClose: () => void;
}

export function InputValidationDialog ({ open, onClose }: InputValidationDialogProps) {
  const [ip, setIp] = useState('');
  const [cidr, setCidr] = useState('');
  const [domain, setDomain] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  // A form is only submittable when *every* field passes validation.
  const allValid = useMemo(() => {
    return (
      validateIpv4(ip).error === null &&
      validateIpv4Cidr(cidr).error === null &&
      validateDomain(domain).error === null
    );
  }, [ip, cidr, domain]);

  const handleSubmit = () => {
    if (!allValid) return;
    setSubmitted(`Validated target: ${ip} · ${cidr} · ${domain}`);
  };

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4'>
      <div className='glass-card rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-border-light/30'>
        {/* Header */}
        <div className='flex items-center justify-between p-5 border-b border-border-light/20'>
          <div className='flex items-center gap-3'>
            <div className='p-2 bg-primary/10 rounded-lg'>
              <ShieldCheck className='w-5 h-5 text-primary' />
            </div>
            <div>
              <h2 className='text-xl font-bold text-white/95'>Input Validation Example</h2>
              <p className='text-xs text-text-light/60 mt-0.5'>
                How to validate IP addresses, CIDR ranges, and domain names.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='p-2 rounded-lg text-text-light/60 hover:text-white hover:bg-dark-300/50 transition-all'
            aria-label='Close'
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        {/* Body */}
        <div className='flex-1 overflow-auto p-5 space-y-5'>
          <ValidatedField
            label='IP Address'
            placeholder='192.168.1.10'
            hint='IPv4 only — four numbers 0-255 separated by dots, e.g. 192.168.1.10.'
            validate={validateIpv4}
            value={ip}
            onChange={(v) => { setIp(v); setSubmitted(null); }}
          />

          <ValidatedField
            label='Network (CIDR)'
            placeholder='10.0.0.0/24'
            hint='An IPv4 network plus a prefix length 0-32, e.g. 10.0.0.0/24.'
            validate={validateIpv4Cidr}
            value={cidr}
            onChange={(v) => { setCidr(v); setSubmitted(null); }}
          />

          <ValidatedField
            label='Domain Name'
            placeholder='scanme.example.com'
            hint='Host only, no scheme or path, e.g. scanme.example.com.'
            validate={validateDomain}
            value={domain}
            onChange={(v) => { setDomain(v); setSubmitted(null); }}
          />

          {submitted && (
            <div className='flex items-start gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2'>
              <Check className='w-4 h-4 flex-shrink-0 mt-0.5' />
              <span>{submitted}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='p-4 border-t border-border-light/20 flex items-center justify-between gap-3'>
          <div className='text-[11px] text-text-light/50'>
            The button stays disabled until every field is valid.
          </div>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              onClick={onClose}
              className='border-border-light/40 hover:border-primary/50'
            >
              Close
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!allValid}
              className='bg-primary hover:bg-primary/90 gap-2'
            >
              <ShieldCheck className='w-4 h-4' />
              Validate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
