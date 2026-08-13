set -euo pipefail

message="Hello World"
joke="Why do programmers prefer dark mode? Because light attracts bugs."

echo "message=$message" >> "$GITHUB_OUTPUT"
echo "joke=$joke" >> "$GITHUB_OUTPUT"

{
  echo "## Cacophony sample succeeded"
  echo
  echo "**Output:** $message"
  echo
  echo "**Programmer joke:** $joke"
} >> "$GITHUB_STEP_SUMMARY"

echo "$message"
echo "$joke"
