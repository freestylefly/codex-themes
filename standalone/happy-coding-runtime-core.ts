export type RuntimeCommand = "watch" | "apply-once" | "cleanup";

export function parseRuntimeCommand(args: string[]): RuntimeCommand {
  const option = args[0] ?? "--watch";
  if (option === "--watch") return "watch";
  if (option === "--apply-once") return "apply-once";
  if (option === "--cleanup") return "cleanup";
  throw new Error(`Unknown option: ${option}`);
}
