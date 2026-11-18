export const dataExtensions = ['csv', 'tsv', 'json', 'jsonl', 'ndjson', 'xlsx', 'parquet', 'tif', 'tiff'] as const;
export const dataAccept = dataExtensions.map(extension => '.' + extension).join(',');
export function dataFormat(name: string) {
  return dataExtensions.find(extension => name.toLowerCase().endsWith('.' + extension));
}
