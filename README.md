# Orbit 0.5.0

Launcher de bureau en français pour Windows, macOS et Linux : bibliothèque locale, jeux et logiciels, recherche, favoris, rubriques et sous-rubriques, routines, icônes natives, thèmes clair/sombre/système et suivi automatique des processus.

## Développement

Node.js 22 ou supérieur, puis :

```sh
npm install
npm start
npm test
npm run dist
```

Le dépôt de référence est https://github.com/GwendalPayoux/Orbit. Les sources et les versions téléchargeables sont distribuées via ce dépôt et ses Releases. `npm run dist` construit localement sans publier.

Ouvrir `ui/index.html` permet un aperçu interactif avec des applications fictives. Le navigateur ne détecte et ne lance pas les applications du PC. L’application Electron utilise une bibliothèque réelle séparée.

## Routines et rubriques

**Créer une routine** permet de choisir de 1 à 40 applications. **Activer** lance les applications en parallèle, en évitant de relancer celles déjà détectées en cours. La routine peut être renommée, modifiée et supprimée. Si une application échoue, les autres restent lancées et un bilan indique les échecs. Retirer une application de la bibliothèque la retire également des routines.

Le formulaire des rubriques propose une **rubrique parente**. Les applications peuvent être rangées à tous les niveaux ; sélectionner un parent affiche également ses descendants. Renommer ou déplacer une rubrique conserve les affectations dans ses descendants. Supprimer une rubrique supprime ses sous-rubriques et retire leurs affectations, sans retirer ni désinstaller les applications.

Les jeux reconnus sont pré-attribués à **Jeux**. Steam, Epic Games Launcher, GOG Galaxy, EA app, Battle.net, Ubisoft Connect, Riot Client, Rockstar Games Launcher et d’autres plateformes reconnues vont dans **Jeux / Launchers**, en conservant leur type logiciel. Le filtre Jeux inclut ces plateformes. Les corrections manuelles sont conservées.

## Exploration des disques

L’exploration combine les points d’entrée standards et un parcours des disques/volumes montés accessibles :

- Windows : menus Démarrer, bureaux utilisateur/commun, exécutables `.exe` sur les lecteurs fixes, amovibles et réseau prêts.
- macOS : applications standards et bundles `.app` sur les volumes accessibles.
- Linux : fichiers `.desktop` système/utilisateur/Flatpak et fichiers `.AppImage` sur les volumes accessibles ; lancement des `.desktop` avec `gio`.

Le scan affiche sa progression et peut être annulé. Les modifications de bibliothèque et le suivi des processus continuent pendant le parcours. Les dossiers inaccessibles sont comptés. Les liens symboliques/jonctions, caches, corbeilles, Windows et répertoires système spéciaux sont exclus pour éviter les boucles et les composants techniques. Les volumes démontés, verrouillés, non prêts ou non autorisés ne peuvent pas être parcourus ; un volume réseau lent peut retarder l’annulation d’une opération de lecture déjà engagée. Les exécutables Linux sans extension et les scripts arbitraires ne sont pas importés automatiquement.

Le pré-tri utilise les noms, chemins, cibles de raccourcis, métadonnées Windows/macOS et catégories Linux. Les aides, installateurs, composants auxiliaires et utilitaires système sont masqués. Les exécutables inconnus trouvés sur les disques vont aussi dans **Applications masquées**, où l’on peut vérifier leur fiche et les réafficher. Les inconnus issus des menus d’applications restent visibles. Aucune analyse ne lance les fichiers parcourus et aucun résultat d’inventaire n’est envoyé à un service externe.

Après une exploration réussie, la grande carte est masquée durablement et **Explorer mes disques** apparaît en haut à droite. Une ancienne bibliothèque déjà importée est considérée comme explorée. Une annulation ou une erreur ne valide pas la première exploration.

## Icônes

Les icônes sont chargées à la demande depuis les fichiers locaux via Electron sur Windows/macOS. Sous Linux, Orbit recherche les icônes PNG indiquées par les fichiers `.desktop` dans les emplacements usuels. Les initiales s’affichent lorsqu’aucune icône exploitable n’est disponible. Les icônes ne sont pas enregistrées en base64 dans la bibliothèque et aucun visuel n’est téléchargé.

## Applications principales (0.5.0)

Les variantes d’un même produit et d’un même exécutable sont regroupées. Battle.net, Overwolf et les principales plateformes de jeux ont des règles explicites pour privilégier leur véritable lanceur, hors aides, agents, navigateurs embarqués et anciennes copies. Les chemins alternatifs des exécutables principaux restent associés à la fiche pour le suivi des processus ; les auxiliaires ne sont pas utilisés pour prolonger artificiellement le compteur. Les favoris, identifiants, affectations manuelles et routines sont conservés. Le maximum des temps précédemment enregistrés est retenu pour éviter d’additionner deux compteurs qui avaient tourné simultanément.

Les entrées sans nom, composées uniquement d’espaces ou portant un nom fictif comme `undefined` sont exclues dès l’import et retirées des anciennes bibliothèques. Le nettoyage se fait au lancement et après une exploration, sans modifier les fichiers installés. Les applications aux noms identiques mais aux produits différents et les raccourcis aux arguments distincts ne sont pas confondus.

La version des logiciels n’est plus affichée sur leurs cartes ni dans leur fiche. Les métadonnées de version restent internes pour choisir une variante récente ; la version d’Orbit reste visible dans son panneau de mise à jour.

## Temps d’utilisation automatique

Orbit interroge les processus toutes les trois secondes : chemins d’exécutables Windows, exécutables de bundles macOS et `/proc` sous Linux. Le compteur démarre quand un processus reconnu est détecté, y compris si l’application a été ouverte hors d’Orbit, et s’arrête après sa disparition. Plusieurs instances d’un même exécutable ne multiplient pas le temps. Le bouton de fin de session manuelle a été retiré.

Il s’agit du temps pendant lequel le processus tourne, pas du temps d’activité au premier plan. Orbit doit rester ouvert, éventuellement minimisé. Le suivi ne continue pas après sa fermeture ; les données sont enregistrées périodiquement et à la fermeture normale. La précision dépend de l’intervalle d’observation. Les longues interruptions de surveillance/veille ne sont pas intégralement ajoutées. Un arrêt brutal peut perdre les dernières secondes non enregistrées.

Les intermédiaires tels que Steam avec `applaunch`, Flatpak, Snap ou un script système peuvent masquer le véritable exécutable : la fiche indique **Suivi indisponible** au lieu d’attribuer le temps du lanceur au jeu. Les changements vers un autre exécutable et certains AppImage demandent encore des associations spécifiques. Les processus protégés/inaccessibles ne sont pas devinés par leur seul nom ; un suivi déjà établi est suspendu en cas d’ambiguïté. Un échec global d’observation est affiché dans la bibliothèque.

La bibliothèque reste dans le répertoire Electron `userData`, fichier `library.json`. Les routines, rubriques, favoris, corrections, temps et état de première exploration y sont conservés. Aucun logiciel n’est désinstallé par Orbit.

## Distribution et mises à jour

L’installateur Windows de développement est `dist/Orbit Setup 0.5.0.exe`. Il n’a pas de certificat de signature configuré. Les cibles macOS (DMG + ZIP) et Linux (AppImage) doivent être compilées et validées sur leurs plateformes.

La configuration embarque **GitHub Releases de GwendalPayoux/Orbit** comme fournisseur de mises à jour. Chaque Release publique doit contenir ses installateurs et manifestes complets. Les versions antérieures non configurées nécessitent une installation initiale de la nouvelle version. La 0.4.0 est déjà reliée à ce fournisseur et peut recevoir la 0.5.0 via le bouton de mise à jour. Le site vitrine n’est pas créé.

Le workflow `.github/workflows/release.yml` prépare des builds Windows/macOS/Linux et les envoie vers une **Release en brouillon** lors d’un tag `v*` ou d’un lancement manuel. La publication publique reste une action distincte. Voir [le guide des mises à jour](docs/updates.md) pour la procédure, les signatures et le fournisseur HTTPS alternatif.

## Vérifications

29 tests unitaires et d’intégration : regroupement des variantes, sélection des exécutables principaux, conservation des routines/favoris, exclusion des noms absents, catégories hiérarchiques, exploration, suivi des processus et mises à jour. Les lectures de processus Windows peuvent nécessiter de sortir d’un environnement de test isolé ; l’application ne demande pas automatiquement des droits administrateur.

Quatre scénarios Chromium vérifient l’interface et les nouvelles fonctions avec un pont natif simulé. `scripts/verify-desktop.cjs` teste également Electron réel en fenêtre masquée et profil temporaire : preload IPC, icône Windows, détection de processus, sauvegarde des routines et sous-rubriques, fermeture propre. Les scripts d’interface nécessitent Playwright. La lecture de métadonnées Windows a été vérifiée sur un exécutable réel et trois volumes prêts ont été énumérés ; aucun scan intégral de tous les disques n’a été exécuté pendant les tests.

Le lancement de logiciels tiers, l’installation sur un poste propre, les notifications natives et une mise à jour publique complète restent à valider. Linux et macOS ne sont pas encore testés sur des machines réelles.
