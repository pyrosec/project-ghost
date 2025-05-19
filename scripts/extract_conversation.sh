#!/bin/bash

# Script to extract conversations from .list files
# Usage: 
#   ./extract_conversation.sh --alice <number> --bob <number>
#   ./extract_conversation.sh -i/--input <list_file>

# Parse command line arguments
MODE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --alice)
      ALICE="$2"
      MODE="conversation"
      shift 2
      ;;
    --bob)
      BOB="$2"
      MODE="conversation"
      shift 2
      ;;
    -i|--input)
      INPUT_FILE="$2"
      MODE="all_contacts"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --alice <number> --bob <number>"
      echo "   or: $0 -i/--input <list_file>"
      exit 1
      ;;
  esac
done

# Check if valid arguments are provided
if [ "$MODE" = "conversation" ] && ([ -z "$ALICE" ] || [ -z "$BOB" ]); then
  echo "Error: Both --alice and --bob numbers must be provided for conversation mode"
  echo "Usage: $0 --alice <number> --bob <number>"
  exit 1
elif [ "$MODE" = "all_contacts" ] && [ -z "$INPUT_FILE" ]; then
  echo "Error: Input file must be provided for all contacts mode"
  echo "Usage: $0 -i/--input <list_file>"
  exit 1
elif [ -z "$MODE" ]; then
  echo "Error: Either specify --alice and --bob for a specific conversation"
  echo "       or -i/--input for processing all contacts in a file"
  echo "Usage: $0 --alice <number> --bob <number>"
  echo "   or: $0 -i/--input <list_file>"
  exit 1
fi

# Check if input file exists in all_contacts mode
if [ "$MODE" = "all_contacts" ] && [ ! -f "$INPUT_FILE" ]; then
  echo "Error: Input file '$INPUT_FILE' not found"
  exit 1
fi

# Function to process a specific conversation between two numbers
process_conversation() {
  local alice="$1"
  local bob="$2"
  local temp_file=$(mktemp)
  local files_to_process=()
  
  # Determine which files to process
  if [ -n "$INPUT_FILE" ]; then
    files_to_process=("$INPUT_FILE")
  else
    # Process all .list files in the current directory
    for file in *.list; do
      [ -f "$file" ] && files_to_process+=("$file")
    done
  fi
  
  for file in "${files_to_process[@]}"; do
    # Extract messages between Alice and Bob
    grep -A 20 "INCOMING:<$alice=>$bob>\|INCOMING:<$bob=>$alice>" "$file" | 
    while IFS= read -r line; do
      # Extract timestamp and message content
      if [[ $line =~ \["when"\]\ =\ ([0-9]+)\; ]]; then
        TIMESTAMP=${BASH_REMATCH[1]}
        # Read the next few lines to find the message pattern
        MESSAGE_CONTENT=""
        SENDER=""
        
        # Store the pattern line to determine sender
        if [[ $(echo "$line" | grep -B 10 -A 0 "INCOMING:<$alice=>$bob>") ]]; then
          SENDER="$alice"
        elif [[ $(echo "$line" | grep -B 10 -A 0 "INCOMING:<$bob=>$alice>") ]]; then
          SENDER="$bob"
        fi
        
        # If we found a timestamp and sender, output to temp file
        if [ -n "$TIMESTAMP" ] && [ -n "$SENDER" ]; then
          # Extract the actual message content (which is in the "INCOMING:<number=>number>" line)
          MESSAGE_LINE=$(echo "$line" | grep -B 10 -A 0 "INCOMING:")
          if [ -n "$MESSAGE_LINE" ]; then
            # Extract the text between quotes after "INCOMING:<number=>number>"
            MESSAGE_CONTENT=$(echo "$MESSAGE_LINE" | sed -n 's/.*INCOMING:<[0-9]*=>[0-9]*>\"\;\s*\(.*\)/\1/p')
            
            # If message content is empty, it might be on a separate line
            if [ -z "$MESSAGE_CONTENT" ]; then
              # Try to find the actual message content in surrounding lines
              MESSAGE_CONTENT=$(echo "$line" | grep -A 5 "INCOMING:" | grep -v "INCOMING:" | head -n 1 | tr -d '\t"')
            fi
            
            # Output to temp file: timestamp, sender, message
            echo "$TIMESTAMP|$SENDER|$MESSAGE_CONTENT" >> "$temp_file"
          fi
        fi
      fi
    done
  done
  
  # Sort messages by timestamp and format output
  if [ -s "$temp_file" ]; then
    sort -n -t '|' -k1 "$temp_file" | while IFS='|' read -r timestamp sender message; do
      # Convert Unix timestamp to human-readable date
      date_str=$(date -d "@$timestamp" "+%Y-%m-%d %H:%M:%S")
      
      # Determine if sender is Alice or Bob for display
      if [ "$sender" = "$alice" ]; then
        sender_name="Alice ($alice)"
      else
        sender_name="Bob ($bob)"
      fi
      
      # Output formatted message
      echo "[$date_str] $sender_name: $message"
    done
  else
    echo "No messages found between $alice and $bob"
  fi
  
  # Clean up
  rm -f "$temp_file"
}

# Function to extract all contacts from a list file
extract_contacts() {
  local file="$1"
  local temp_file=$(mktemp)
  
  # Extract all unique phone number patterns from the file
  grep -o "INCOMING:<[0-9]*=>[0-9]*>" "$file" | 
  sed 's/INCOMING:<\([0-9]*\)=>\([0-9]*\)>/\1 \2/' | 
  tr ' ' '\n' | sort -u > "$temp_file"
  
  # Get the owner number (the most common recipient)
  OWNER_NUMBER=$(grep -o "INCOMING:<[0-9]*=>[0-9]*>" "$file" | 
                sed 's/INCOMING:<[0-9]*=>\([0-9]*\)>/\1/' | 
                sort | uniq -c | sort -nr | head -n 1 | awk '{print $2}')
  
  echo "Owner number appears to be: $OWNER_NUMBER"
  echo "Found contacts:"
  
  # Process each contact
  cat "$temp_file" | while read -r contact; do
    # Skip the owner number
    if [ "$contact" != "$OWNER_NUMBER" ]; then
      echo "Processing conversation with contact: $contact"
      echo "========================================================"
      process_conversation "$contact" "$OWNER_NUMBER"
      echo "========================================================"
      echo ""
    fi
  done
  
  # Clean up
  rm -f "$temp_file"
}

# Main execution based on mode
if [ "$MODE" = "conversation" ]; then
  process_conversation "$ALICE" "$BOB"
elif [ "$MODE" = "all_contacts" ]; then
  extract_contacts "$INPUT_FILE"
fi
