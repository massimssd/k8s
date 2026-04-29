# ============================================================
# ArgoCD — Guide de déploiement
# Auteur: KHLIFI HOUCEM / FORMATEUR DEVSECOPS & CLOUD
# ============================================================

## Prérequis

# 1. Installer ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 2. Attendre que ArgoCD soit prêt
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=120s

# 3. Récupérer le mot de passe admin initial
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 4. Accéder à l'UI ArgoCD
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Ouvrir https://localhost:8080 (user: admin)

# 5. (Optionnel) Installer le CLI ArgoCD
# brew install argocd  (macOS)
# curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64 (Linux)


## Déployer avec les manifests K8s bruts

# Appliquer le projet ArgoCD
kubectl apply -f argocd/project.yaml

# Déployer via les manifests YAML
kubectl apply -f argocd/application-manifests.yaml

# Vérifier le statut
kubectl get applications -n argocd


## Déployer avec Helm via ArgoCD

# Déployer via le Helm chart
kubectl apply -f argocd/application-helm.yaml

# Vérifier
kubectl get applications -n argocd


## CLI ArgoCD (optionnel)

# Login
argocd login localhost:8080 --insecure

# Lister les applications
argocd app list

# Synchroniser manuellement
argocd app sync demo-app-helm

# Voir le statut détaillé
argocd app get demo-app-helm

# Voir les différences (drift)
argocd app diff demo-app-helm

# Rollback
argocd app rollback demo-app-helm


## Nettoyage

# Supprimer les applications
kubectl delete -f argocd/application-helm.yaml
kubectl delete -f argocd/application-manifests.yaml
kubectl delete -f argocd/project.yaml
