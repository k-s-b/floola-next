#!/bin/bash
# Move to the script's directory
cd "$(dirname "$0")"

echo "========================================================"
echo "          Launching Floola-Next (Modern 64-bit)        "
echo "========================================================"
echo "Starting Flask server..."
echo "Your browser will open automatically at http://127.0.0.1:5055"
echo "To stop Floola-Next, close this terminal window."
echo "========================================================"

# Check if python3 is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 is not installed on your system."
    echo "Please download and install Python 3 from https://www.python.org/downloads/"
    read -p "Press Enter to exit..."
    exit 1
fi

# Run the app
python3 app.py
