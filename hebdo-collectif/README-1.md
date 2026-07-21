# Widget Grist SAJ — une demi-journée par feuille A3

Ce widget produit **10 feuilles A3 paysage** :

1. Lundi matin
2. Lundi après-midi
3. Mardi matin
4. Mardi après-midi
5. Mercredi matin
6. Mercredi après-midi
7. Jeudi matin
8. Jeudi après-midi
9. Vendredi matin
10. Vendredi après-midi

Chaque feuille contient une seule demi-journée et jusqu’à **7 activités**. Les portraits sont répartis automatiquement sur plusieurs lignes dans la zone colorée de leur activité. La feuille du matin contient la bande « Repas de midi » ; celle de l’après-midi ne l’affiche pas.

## 1. Fichiers à publier

Le dossier contient :

- `index.html` : structure du widget ;
- `styles.css` : mise en page A3, couleurs et impression ;
- `app.js` : lecture des tables Grist et affichage des images ;
- `README.md` : cette notice.

Ne publiez jamais les photos des usagers sur GitHub. GitHub ne doit contenir que ces fichiers de code.

## 2. Tables à créer dans Grist

Respectez exactement les noms de tables et de colonnes ci-dessous.

### Table `Participants`

| Colonne | Type Grist | Rôle |
|---|---|---|
| `Nom` | Texte | Prénom ou nom affiché sous la photo |
| `Photo` | Pièce jointe | Portrait de la personne |

### Table `Planning`

Une ligne correspond à une activité pour une demi-journée.

| Colonne | Type Grist | Valeurs |
|---|---|---|
| `Jour` | Choix | Lundi, Mardi, Mercredi, Jeudi, Vendredi |
| `Moment` | Choix | Matin ou Apres-midi |
| `Activite` | Texte | Nom de l’activité |
| `LogoActivite` | Pièce jointe | Pictogramme de l’activité |
| `Couleur` | Texte | Code hexadécimal, par exemple `#1366C2` |
| `Ordre` | Entier | Position de 1 à 7 |
| `Participants` | Liste de références | Références vers la table `Participants` |

Attention : utilisez `Apres-midi` sans accent dans la colonne `Moment`. Le widget accepte aussi `Après-midi` et `Soir`.

### Table `Parametres`

Créez une ligne par jour.

| Colonne | Type Grist | Exemple |
|---|---|---|
| `Jour` | Choix | Lundi |
| `LogoSAJ` | Pièce jointe | Logo de votre SAJ |
| `HeureMatin` | Texte | 10h30 - 11h30 |
| `HeureRepas` | Texte | 12h00 - 13h30 |
| `HeureApresMidi` | Texte | 14h30 - 15h30 |

## 3. Où stocker les images et les photos ?

Toutes les images doivent être stockées **directement dans le document Grist**, dans des colonnes de type **Pièce jointe** :

- logo du SAJ : `Parametres.LogoSAJ` ;
- pictogramme d’activité : `Planning.LogoActivite` ;
- photo d’un participant : `Participants.Photo`.

Dans une cellule de type Pièce jointe, cliquez sur la cellule puis choisissez le fichier. Le widget récupère automatiquement la première image de la cellule.

Conseils :

- portraits en JPG ou PNG, cadrés verticalement sur le visage ;
- pictogrammes carrés en PNG, de préférence avec fond transparent ;
- logo du SAJ en PNG de bonne qualité ;
- noms courts pour rester lisibles en A3.

## 4. Publier sur GitHub Pages

1. Connectez-vous à GitHub.
2. Cliquez sur **New repository**.
3. Nommez-le par exemple `planning-saj-grist`.
4. Choisissez **Public** puis **Create repository**.
5. Cliquez sur **Add file > Upload files**.
6. Déposez `index.html`, `styles.css`, `app.js` et éventuellement `README.md` à la racine.
7. Validez avec **Commit changes**.
8. Ouvrez **Settings > Pages**.
9. Dans **Build and deployment**, choisissez **Deploy from a branch**.
10. Sélectionnez la branche `main` et le dossier `/ (root)`.
11. Cliquez sur **Save**.

GitHub affiche ensuite une adresse semblable à :

`https://VOTRE-COMPTE.github.io/planning-saj-grist/`

La publication peut nécessiter un rafraîchissement de la page GitHub Pages avant que l’adresse fonctionne.

## 5. Ajouter le widget dans Grist

1. Ouvrez votre document Grist.
2. Cliquez sur **Ajouter nouveau > Ajouter un widget à la page**.
3. Choisissez la table `Planning` comme source de données.
4. Choisissez **Custom / Personnalisé**.
5. Ouvrez les options du widget avec les trois points.
6. Collez l’adresse GitHub Pages dans **Custom URL / URL personnalisée**.
7. Choisissez l’accès **Full document access / Accès complet au document**.

L’accès complet est nécessaire parce que le widget lit trois tables différentes : `Planning`, `Participants` et `Parametres`. Le code fourni ne modifie pas les données.

## 6. Utiliser le planning

En haut du widget :

- cliquez sur un jour ;
- choisissez **Matin** ou **Après-midi** ;
- cliquez sur **Imprimer cette page A3** pour la demi-journée affichée ;
- cliquez sur **Imprimer les 10 pages** pour toute la semaine.

Le nombre d’activités peut varier de 1 à 7 pour chaque demi-journée. La largeur des zones est calculée automatiquement. Les participants passent automatiquement sur plusieurs lignes.

## 7. Impression A3

Dans la fenêtre d’impression du navigateur :

- papier : **A3** ;
- orientation : **Paysage** ;
- échelle : **100 %** ou « Ajuster à la page » si votre imprimante réduit les marges ;
- marges : **Aucune** ou **Minimales** ;
- activez **Graphiques d’arrière-plan** pour conserver les zones colorées ;
- désactivez les en-têtes et pieds de page du navigateur.

## 8. Vérification rapide

Si le widget affiche la démonstration à la place de vos données, vérifiez :

- l’orthographe exacte des trois noms de tables ;
- l’orthographe exacte des colonnes ;
- l’autorisation « Accès complet au document » ;
- la présence d’au moins une ligne dans `Parametres` ;
- la valeur `Matin` ou `Apres-midi` dans `Planning.Moment` ;
- les références de `Planning.Participants` vers la table `Participants`.

Le widget affiche aussi une démonstration lorsqu’il est ouvert directement hors de Grist. Cela permet de vérifier que GitHub Pages fonctionne avant de le connecter au document.
