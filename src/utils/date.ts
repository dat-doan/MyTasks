function padNumber(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date");
  }

  const day = padNumber(date.getDate());
  const month = padNumber(date.getMonth() + 1);
  const year = padNumber(date.getFullYear(), 4);

  return `${day}/${month}/${year}`;
}

export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}
