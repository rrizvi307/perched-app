#!/bin/bash

# Script to update demo data with better coffee shop content
# Run this to reseed the demo feed with engaging content

echo "🔄 Updating demo data with better content..."

# Backup the original file
cp storage/local.ts storage/local.ts.backup

echo "✅ Backup created at storage/local.ts.backup"
echo "📝 Manual update required:"
echo ""
echo "Please update storage/local.ts around line 797:"
echo "Replace the 'let demoCheckins = [...]' array with the content from:"
echo "storage/demo-data-updated.ts"
echo ""
echo "Or run: npm run reset-demo"
