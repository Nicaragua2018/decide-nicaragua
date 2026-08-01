'use client';

interface ConfirmFormProps {
  action: (payload: FormData) => Promise<void> | void;
  message: string;
  className?: string;
  children: React.ReactNode;
}

export function ConfirmForm({ action, message, className, children }: ConfirmFormProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(message)) {
      e.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className={className}>
      {children}
    </form>
  );
}
