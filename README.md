# Post-Processors Runners

## Project Overview & Value Proposition

Le dépôt **`post-processors-runner`** héberge la flotte des consommateurs événementiels de Volontariapp. Ces services constituent le maillon final de notre architecture réactive, garantissant le traitement fiable, idempotent et à haut débit des événements asynchrones transitant via **Redis Streams**.

La proposition de valeur de ce projet réside dans sa résilience face aux pannes distribuées. Grâce à l'utilisation avancée du paquet central `@volontariapp/post-processors`, chaque runner est immunisé contre les "poison messages" et les pannes en cascade via des mécanismes industriels (Circuit Breaker, Dead-Letter Queues, Exponential Backoff, Idempotency). Ils sont construits en tant que **Contextes d'Application Standalone NestJS** (sans pile HTTP), offrant une empreinte mémoire drastiquement réduite tout en conservant la puissance de l'Injection de Dépendances (IoC).

## Key Features

- **Consommation de Flux (Redis Streams)** : Lecture continue et asynchrone des groupes de consommateurs (Consumer Groups).
- **Tolérance aux Pannes (Circuit Breaker)** : Interruption automatique de la consommation si les dépendances en aval (ex: base de données) tombent, prévenant les pannes en cascade (Cascading Failures).
- **Idempotence Stricte** : Utilisation de verrous distribués pour s'assurer qu'un message délivré plusieurs fois n'est traité fonctionnellement qu'une seule fois.
- **Gestion des Échecs (Retry & DLQ)** : Retentatives avec backoff exponentiel pour les erreurs transitoires, et relégation des messages en échec persistant dans une Dead-Letter Queue (DLQ).
- **Serveur de Diagnostic Allégé** : Monitoring natif Node.js sans le surcoût d'un framework web complet (Express/Fastify), interrogeant en temps réel l'état de Postgres et Redis.

> **Note d'Architecture** : Pour une compréhension approfondie des 4 boucles asynchrones internes (Run, Claim, Retry, DLQ) et du nettoyage de l'Outbox distribué, consultez notre [Document d'Architecture (ARCHITECTURE.md)](file:///Users/victoragahi/Developer/meta/post-processors-runner/ARCHITECTURE.md).

## Tech Stack & Dependencies

| Composant | Technologie | Usage / Rôle |
| :--- | :--- | :--- |
| **Framework Base** | NestJS (Standalone) | Inversion de contrôle et structuration des modules, sans la surcouche HTTP. |
| **Orchestration Métier**| [`@volontariapp/post-processors`](https://github.com/Volontariapp/npm-packages/tree/main/packages/post-processors) | Librairie métier gérant les boucles d'exécution, le Circuit Breaker et la DLQ. |
| **Message Broker** | Redis Streams | Bus d'événements persistant pour l'intégration inter-services. |
| **Monitoring** | Node.js natif (`http`) | Serveur de Health Check minimaliste écoutant sur des ports dédiés (ex: 4201). |

## Getting Started

### Prérequis

- **Node.js** (>= 24.14.0)
- **Package Manager** : Yarn v4 (`corepack enable`)
- Infrastructure de base de données PostgreSQL et un cluster Redis accessibles (fournis via `ci-tools`).

### Structure et Ports de Diagnostic

Chaque domaine possède son runner dédié écoutant son propre stream Redis :

| Nom du Runner | Port Diagnostic | Redis Stream | Consumer Group |
| :--- | :---: | :--- | :--- |
| **`post-processor-user`** | `4201` | `stream:ms-user` | `post-processor-user` |
| **`post-processor-post`** | `4202` | `stream:ms-post` | `post-processor-post` |
| **`post-processor-event`** | `4203` | `stream:ms-event` | `post-processor-event` |
| **`post-processor-social`**| `4204` | `stream:ms-social` | `post-processor-social`|

### Installation & Exécution (Command Center)

Le projet intègre un outil de gestion global `command.sh` (en cours de finalisation) pour opérer la flotte de manière centralisée :

```bash
cd post-processors-runner

# Installation globale (via Yarn workspaces)
yarn install

# Lancement des workers en mode développement
yarn run:all
```

## CI/CD & Deployment

- **Contrôle Qualité** : Le pipeline GitHub Actions valide le typage strict (`class-validator`/TypeScript) et le linting (ESLint) à chaque Push.
- **Dockerisation** : Les conteneurs OCI sont construits avec le résolveur `.yarnrc.yml` embarqué pour garantir l'immutabilité des dépendances.
- **Graceful Shutdown** : Le cycle de vie est géré via `OnModuleDestroy`. Les signaux `SIGTERM/SIGINT` de Kubernetes ferment proprement les sockets Redis/Postgres avant la destruction du pod.
