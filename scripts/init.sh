#!/bin/bash
function start_path() {
  echo $( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
}
startpath=$(start_path)
database_directory=$(cat ${startpath}/../.env | grep -oP 'PROJECT_GHOST_DATABASE=.*$' | cut -d '=' -f 2)
cd $database_directory
declare -a directories=("postgres" "synapse" "vaultwarden" "www-data" "redis" "letsencrypt" "asterisk" "spool" "prosody" "gcloud" "sms_pipeline" "logs")
for i in "${directories[@]}"
do
  echo "mkdir $database_directory/${i}/"
  mkdir $i 2> /dev/null
done
