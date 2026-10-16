# Distribution des mises à jour d’Orbit

## État actuel

Orbit 0.5.0 utilise par défaut les Releases GitHub publiques du dépôt [GwendalPayoux/Orbit](https://github.com/GwendalPayoux/Orbit). Le moteur, le panneau, les notifications, le téléchargement et le redémarrage sont intégrés. Les sources et les installateurs Windows sont distribués dans ce dépôt public. Un dépôt privé sans accès public ne peut pas distribuer ces mises à jour aux utilisateurs anonymes.

Les versions 0.1.0 et 0.2.0 ne contiennent pas ce mécanisme. Il faut installer une fois une version configurée pour recevoir ensuite les mises à jour directement dans Orbit. Installer la 0.3.0 non configurée permet de tester l’interface, mais n’active pas un service distant.

## Publier via GitHub

1. Envoyer les sources au dépôt, puis augmenter `package.json` pour chaque nouvelle version.
2. Déclencher le workflow `Build Orbit release` manuellement ou pousser un tag `v<version>` correspondant au numéro du paquet.
3. Le workflow construit Windows/macOS/Linux et ajoute les binaires et manifestes à une **Release en brouillon**, à l’aide du `GITHUB_TOKEN` du workflow. Il ne contient aucun jeton dans l’application distribuée. Configurer les certificats de signature via les secrets GitHub avant la distribution publique ; sans signature Apple, les mises à jour macOS ne fonctionneront pas.
4. Vérifier les artefacts et publier le brouillon sur GitHub. Pour Windows, `latest.yml`, l’installateur `.exe` et son `.blockmap` doivent figurer dans la même Release. Pour macOS/Linux, conserver également les manifestes et fichiers indiqués dans le tableau ci-dessous.
5. Installer cette première version configurée, puis vérifier une mise à jour vers une Release supérieure sur un poste de test. Ne pas publier une version inférieure pour revenir en arrière : augmenter le numéro de version du correctif.

Les secrets de signature du workflow sont séparés : `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` pour Windows, `MAC_CSC_LINK`/`MAC_CSC_KEY_PASSWORD` pour macOS, ainsi que `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` et `APPLE_TEAM_ID` pour la notarisation Apple. Ils se configurent sur GitHub et ne doivent pas être ajoutés aux sources.

`npm run dist` construit sans téléversement. Contrôler les builds dans l’onglet Actions et vérifier les artefacts avant chaque publication. La configuration locale est vérifiable dans `electron-builder.config.cjs` et le paquet embarque `resources/app-update.yml`.

Pour un téléversement manuel sur GitHub, utiliser les noms `url` attendus dans `latest*.yml` : le fournisseur GitHub normalise les espaces du nom de l’installateur (par exemple `Orbit-Setup-0.4.0.exe`). Le workflow utilise le publieur electron-builder qui effectue cette normalisation automatiquement. Ne pas modifier le contenu du binaire après génération du manifeste.

## Hébergement HTTPS alternatif

1. Préparer un répertoire public HTTPS stable pour les fichiers de mise à jour. Il peut être distinct du site vitrine. L’URL doit être sous votre contrôle, sans authentification, paramètres ou fragment.
2. Définir `ORBIT_UPDATE_URL` lors de la compilation. Exemple PowerShell ci-dessous : **remplacer l’adresse fictive par votre véritable adresse**.

```powershell
$env:ORBIT_UPDATE_URL = 'https://votre-domaine.fr/orbit/updates/'
npm run dist
```

Sous Linux/macOS :

```sh
ORBIT_UPDATE_URL='https://votre-domaine.fr/orbit/updates/' npm run dist
```

Lorsque `ORBIT_UPDATE_URL` est définie, la configuration utilise le fournisseur `generic` à la place de GitHub, embarque `app-update.yml` et active le service. L’adresse est définie par l’éditeur à la compilation, pas par une page distante ni par les noms des applications analysées. Sans variable d’environnement, GitHub est utilisé. `npm run dist` construit localement et ne publie rien.

3. Compiler et signer les versions sur les systèmes cibles, puis transférer les fichiers de `dist/` vers le répertoire HTTPS. Conserver exactement les noms générés.

| Plateforme | Fichiers à héberger |
| --- | --- |
| Windows x64 | Installateur NSIS `.exe`, son `.blockmap`, puis `latest.yml` |
| macOS | `.dmg`, `.zip`, fichiers `.blockmap` générés, puis `latest-mac.yml` |
| Linux AppImage | `.AppImage`, fichiers `.blockmap` générés, puis `latest-linux.yml` |

Téléverser les binaires avant les manifestes `latest*.yml` pour éviter d’annoncer un fichier absent. Ne pas modifier les sommes de contrôle générées. Servir les manifestes sans cache long et conserver les anciennes versions nécessaires aux téléchargements différentiels. Augmenter le champ `version` de `package.json` à chaque publication. Prévoir des répertoires distincts pour des canaux ou architectures supplémentaires.

4. Installer une première version configurée sur un poste de test. Publier une seconde version avec un numéro supérieur sur le même service et vérifier le parcours complet avant diffusion publique.

## Expérience utilisateur

- Recherche 15 secondes après le lancement, puis toutes les six heures tant qu’Orbit reste ouvert ; bouton **Vérifier maintenant** disponible dans le panneau.
- Notification système si l’OS le permet, badge sur le bouton et bannière persistante dans Orbit lorsqu’une version est disponible.
- Téléchargement après clic explicite, avec progression et possibilité de réessayer en cas d’échec.
- Aucune installation automatique à la fermeture ordinaire. Le bouton **Redémarrer et installer** enregistre la bibliothèque et clôture les sessions mesurées avant de lancer l’installateur. Il ne ferme pas les jeux ou logiciels tiers.
- Recherche réseau, téléchargement et progression ne bloquent pas les modifications ordinaires de la bibliothèque ; la préparation du redémarrage empêche de nouvelles modifications pendant l’enregistrement final.
- Les téléchargements sont vérifiés par SHA-512 via `electron-updater`. Les signatures natives sont vérifiées lorsqu’une identité de signature est configurée. Aucun contrôle de signature n’a été désactivé.
- Les versions antérieures et les préversions ne sont pas proposées. Sans réseau, Orbit reste utilisable et affiche une erreur récupérable.

## Signatures et plateformes

Utiliser un certificat de signature Windows et conserver la même identité pour les futures versions. Le paquet de développement actuel n’a pas de certificat configuré : HTTPS et une somme SHA-512 ne remplacent pas une signature d’éditeur. Sur macOS, la signature est nécessaire au fonctionnement de la mise à jour ; prévoir aussi la notarisation pour la distribution. Le paquet ZIP est inclus dans la configuration en plus du DMG. Sous Linux, le flux intégré est destiné à AppImage ; l’exécution hors AppImage affiche un état non compatible.

## Vérifications

`npm test` couvre les transitions, les erreurs, les clics répétés, l’absence d’installation avant enregistrement et les URL de publication. Les tests d’intégration utilisent réellement `NsisUpdater`, un serveur HTTP strictement local, des fichiers factices non exécutables et un cache temporaire pour vérifier : lecture du manifeste, téléchargement sur demande, validation SHA-512, rejet de données corrompues et refus d’une version antérieure. Le HTTP local est exclusivement un dispositif de test ; la configuration de publication exige HTTPS.

Le script `scripts/verify-updates-ui.cjs` vérifie le parcours d’interface avec un pont natif simulé. `updates-preview.png` illustre ce scénario simulé ; aucune version 0.4.0 n’a été publiée. Les notifications système et le remplacement réel d’une installation ne sont pas encore validés en conditions de diffusion. Linux et macOS doivent être testés sur leurs plateformes.

Documentation de référence : [electron-builder 26 — Auto Update](https://www.electron.build/v26/docs/features/auto-update/).
