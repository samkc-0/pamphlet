rsync -avz --progress -e "ssh -i $SSH_KEY_PATH -p $SSH_PORT" \
  ./scripts/dictionary/out/ \
  $SSH_USER@$SSH_HOST:/home/$SSH_USER/pamphlet-sync/deploy/dictionaries/
