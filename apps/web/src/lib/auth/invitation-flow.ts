export async function completeEditorialInvitation<T>(options: {
  savePassword?: () => Promise<void>;
  onPasswordSaved?: () => void;
  activate: () => Promise<T>;
}): Promise<T> {
  if (options.savePassword) {
    await options.savePassword();
    options.onPasswordSaved?.();
  }
  return options.activate();
}
