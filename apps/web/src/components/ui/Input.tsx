import { useId, type InputHTMLAttributes } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
}

/**
 * Brand input primitive — white fill, Mist border, radius 12, 44px tall, Signal focus ring.
 * Errors render in the interface's voice: what's wrong, no apology. See design-system.md #3.
 */
export function Input({ label, error, className = "", required, ...rest }: InputProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-slate">
        {label}
        {required ? " *" : ""}
      </label>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`h-11 rounded-input border bg-white px-3.5 text-[15px] text-ink placeholder:text-slate/60 outline-none transition-colors duration-150 ease-standard focus:ring-[3px] focus:ring-signal/50 disabled:opacity-50 ${
          error ? "border-danger" : "border-mist focus:border-signal"
        } ${className}`}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
