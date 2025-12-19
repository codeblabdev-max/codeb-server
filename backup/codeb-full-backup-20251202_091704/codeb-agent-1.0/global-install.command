#!/bin/bash
cd "$(dirname "$0")"
echo "CodeB Agent 1.0 - Global Installation"
echo "======================================"
echo ""
echo "Installing to /usr/local/codeb-agent..."
echo "This requires administrator privileges."
echo ""
sudo ./install.sh --global
echo ""
echo "Installation complete!"
echo "Press any key to exit..."
read -n 1
