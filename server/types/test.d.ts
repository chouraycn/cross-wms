// Augment DOM Response type for test files
// In @types/node v25+, Response.json() returns Promise<unknown>.
// This augmentation restores Promise<any> for convenience in test assertions.

interface Response {
  json(): Promise<any>;
}
