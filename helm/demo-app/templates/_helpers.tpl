{{/*
============================================================
Helm Helpers - K8s Demo Notes
Auteur: KHLIFI HOUCEM / FORMATEUR DEVSECOPS & CLOUD
============================================================
*/}}

{{/* Nom du chart */}}
{{- define "demo-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Nom complet avec release */}}
{{- define "demo-app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/* Labels standards */}}
{{- define "demo-app.labels" -}}
helm.sh/chart: {{ include "demo-app.name" . }}
app.kubernetes.io/name: {{ include "demo-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app: k8s-demo
author: khlifi-houcem
{{- end }}

{{/* Labels sélecteurs */}}
{{- define "demo-app.selectorLabels" -}}
app: k8s-demo
app.kubernetes.io/name: {{ include "demo-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
