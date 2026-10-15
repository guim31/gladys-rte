# RTE éCO2mix & EcoWatt

Suivez dans Gladys l'état du réseau électrique français, tel que RTE le publie en données ouvertes :
combien de CO₂ émet chaque kilowattheure produit en ce moment, d'où vient l'électricité (nucléaire,
éolien, solaire, barrages, gaz…), et le signal **EcoWatt**, la « météo de l'électricité » qui
prévient quand le réseau est tendu et qu'il faut réduire sa consommation.

De quoi lancer le lave-vaisselle, le ballon d'eau chaude ou la recharge de la voiture quand
l'électricité est la plus propre, et être prévenu la veille d'un jour orange ou rouge.

> **Développée sans accès aux API de RTE : vos retours sont les bienvenus.** Cette intégration a
> été construite et testée sur les formats documentés par RTE (éCO2mix sur ODRÉ, API EcoWatt v5),
> sans compte EcoWatt ni appel réel. Si quelque chose ne marche pas comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-rte/issues).

Intégration indépendante, sans lien avec RTE. Les données restent celles de RTE.

## Présentation

L'intégration lit deux sources de RTE :

- **éCO2mix** (données ouvertes, sans compte ni clé) : le mix de production de la France
  métropolitaine au quart d'heure, la consommation nationale et le **taux de CO₂** en grammes par
  kilowattheure.
- **EcoWatt** (clé gratuite à créer, facultative) : le signal du jour et des trois jours suivants,
  heure par heure. Vert : pas de tension. Orange : système électrique tendu, les écogestes sont
  bienvenus. Rouge : système très tendu, des coupures sont possibles si la consommation ne baisse
  pas.

Elle ajoute deux appareils, un widget pour le tableau de bord et un déclencheur de scène « Alerte
EcoWatt annoncée ».

### EcoWatt est déjà dans Gladys

Gladys affiche déjà EcoWatt, sans cette intégration ni clé RTE : le widget **Ecowatt ( France )**
du tableau de bord (signal heure par heure du jour et des jours suivants) et la condition de scène
**Condition sur Ecowatt ( France )** (« Continuer la scène si le réseau est » ok, tendu ou très
tendu, pour l'heure où la scène s'exécute). Gladys obtient ces données par ses propres serveurs
(ceux de Gladys Plus), sans abonnement ni compte à créer. Il n'y a ni appareil ni déclencheur
EcoWatt dans Gladys.

- **Pour voir EcoWatt sur le tableau de bord**, le widget de Gladys suffit : inutile de renseigner
  une clé ici.
- **La partie EcoWatt de cette intégration** sert à ceux qui veulent EcoWatt dans leurs
  **scènes** : un appareil (aujourd'hui, demain, heure en cours) avec son historique et le
  déclencheur natif « Un appareil change d'état », et le déclencheur **Alerte EcoWatt annoncée**,
  qui lance une scène dès qu'un jour orange ou rouge est annoncé. Elle interroge RTE directement
  avec votre propre clé, sans passer par les serveurs de Gladys.
- **éCO2mix** (taux de CO₂, mix de production, consommation nationale) n'existe que dans cette
  intégration.

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent.
- Un accès à internet depuis Gladys (les données viennent des serveurs de RTE).
- Pour EcoWatt seulement : un compte gratuit sur
  [data.rte-france.com](https://data.rte-france.com) et une application abonnée à l'API
  **Ecowatt** :
  1. Créez votre compte sur data.rte-france.com et connectez-vous.
  2. Dans le catalogue des API, ouvrez **Ecowatt** (version 5) puis **Abonnez-vous à l'API** :
     le portail vous propose de créer une application, donnez-lui un nom (par exemple « Gladys »).
  3. Dans **Mes applications**, ouvrez cette application : elle affiche un **ID client** et un
     **ID secret**. Ce sont les deux valeurs à recopier dans Gladys.

Sans clé, l'intégration fonctionne avec éCO2mix seul.

## Configuration

1. Installez l'intégration depuis le catalogue de Gladys (ou **Intégrations → Installer depuis
   GitHub** avec l'adresse de ce dépôt).
2. Dans **Configuration**, collez si vous le souhaitez l'**ID client EcoWatt** et l'**ID secret
   EcoWatt**. L'ID secret reste dans Gladys et n'apparaît jamais dans les journaux.
3. Choisissez la **Langue des noms de fonctionnalités** (français par défaut). Les noms sont donnés
   à l'ajout d'un appareil et ne changent plus ensuite.
4. Enregistrez, puis ouvrez l'onglet **Découverte** : ajoutez **Réseau électrique français** et,
   avec une clé, **EcoWatt**.

### Bouton « Tester la connexion à RTE »

Lit éCO2mix tout de suite et affiche le taux de CO₂ du dernier quart d'heure publié. Avec une clé,
vérifie aussi que RTE l'accepte et donne le signal EcoWatt du jour. RTE n'autorise qu'un appel aux
signaux EcoWatt tous les quarts d'heure : si le dernier est trop récent, le bouton vérifie la clé
seule et dit dans combien de minutes les signaux seront relus.

## Les appareils

### Réseau électrique français

Mis à jour tous les quarts d'heure, au rythme des données de RTE :

| Fonctionnalité                  | Ce qu'elle mesure                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Taux de CO₂                     | Grammes de CO₂ émis par kilowattheure produit en France (g CO₂eq/kWh)             |
| Consommation nationale          | La consommation de la France métropolitaine, en kW (Gladys n'a pas de GW)         |
| Part bas carbone                | Nucléaire et renouvelables, en % de la production                                 |
| Part renouvelable               | Hydraulique, éolien, solaire et bioénergies, en % de la production                |
| Part du nucléaire, de l'éolien… | La part de chaque filière dans la production, en % entier                         |
| Échanges (import + / export −)  | Ce que les pays voisins fournissent (+) ou reçoivent (−), en % de la consommation |

En France, le taux de CO₂ va le plus souvent de 15 à 80 g/kWh ; il monte quand les centrales à gaz
ou au charbon tournent, en général les soirs d'hiver. Gladys colore la pastille : vert sous 150,
orange jusqu'à 400, rouge au-delà.

### EcoWatt

Avec une clé, trois fonctionnalités donnent le signal EcoWatt tel que RTE le numérote :

| Fonctionnalité         | Valeurs                                            |
| ---------------------- | -------------------------------------------------- |
| EcoWatt aujourd'hui    | 1 vert, 2 orange, 3 rouge                          |
| EcoWatt demain         | 1 vert, 2 orange, 3 rouge                          |
| EcoWatt heure en cours | 0 production décarbonée, 1 vert, 2 orange, 3 rouge |

Gladys les affiche comme un niveau de risque : 0 « Pas de risque », 1 « Faible », 2 « Moyen »,
3 « Élevé ». Un jour vert apparaît donc en jaune « Faible » sur la pastille : c'est la couleur de
Gladys pour un risque faible, pas une alerte. L'heure en cours change à chaque heure pleine.

## Widget

Le widget **Réseau électrique** se place sur le tableau de bord. Il montre :

- le taux de CO₂, la consommation nationale en GW et la part bas carbone ;
- avec une clé, le signal EcoWatt d'aujourd'hui et de demain, en vert, orange ou rouge ;
- la courbe du CO₂ sur 24 heures en barres, une fois l'appareil ajouté (Gladys garde
  l'historique) ;
- le mix de production en barres, filière par filière, avec les importations ou exportations ;
- l'heure du quart d'heure affiché.

## Déclencheur de scène

**Alerte EcoWatt annoncée** (catégorie **Intégrations** de l'éditeur de scènes) : RTE annonce un
jour orange ou rouge, aujourd'hui ou dans les trois jours qui viennent. Le déclencheur part **une
fois par annonce** : quand un jour passe à orange, puis de nouveau s'il passe au rouge, jamais à
chaque lecture, même après un redémarrage.

Filtres (laissés vides, tout correspond) : le **Signal** (orange, rouge) et le **Jour concerné**
(aujourd'hui, demain, dans deux ou trois jours).

Informations transmises aux actions de la scène : le signal (`orange` ou `red`), le niveau EcoWatt
(2 ou 3), la date du jour concerné, dans combien de jours, et le message de RTE.

Pour réagir au taux de CO₂, pas besoin de déclencheur dédié : le déclencheur natif « Un appareil
change d'état » de Gladys compare déjà la fonctionnalité **Taux de CO₂** à un seuil.

## Exemples de scènes

- **CO₂ bas → lancer le lave-vaisselle ou la recharge.** Déclencheur : « Un appareil change
  d'état », **Taux de CO₂** inférieur à 40 g/kWh. Condition : entre 10 h et 16 h (ou dans vos
  heures creuses). Action : allumer la prise du lave-vaisselle préparé le matin, ou la borne de
  recharge.
- **Jour rouge demain → prévenir la maison.** Déclencheur : **Alerte EcoWatt annoncée**, signal
  rouge, jour concerné demain. Action : envoyer un message « Demain jour rouge EcoWatt : on évite
  le four et la machine à laver de 8 h à 13 h et de 18 h à 20 h ».
- **Heure orange ou rouge → décaler la recharge de la voiture.** Déclencheur : « Un appareil change
  d'état », **EcoWatt heure en cours** supérieur ou égal à 2. Action : couper la prise de recharge.
  Une seconde scène la rallume quand la valeur redescend sous 2.

## Rythme de lecture et quotas

- **éCO2mix** est lu tous les quarts d'heure, seulement quand l'appareil est ajouté ou que le
  widget est affiché : 96 appels par jour au plus, sans clé. RTE publie chaque quart d'heure avec
  environ une heure de décalage : les chiffres affichés ont donc souvent une heure.
- **EcoWatt** est lu toutes les 30 minutes. RTE n'autorise **qu'un appel aux signaux toutes les
  15 minutes** par application : l'intégration ne l'appelle jamais plus souvent, s'en souvient
  après un redémarrage (dans `/data`) et respecte le délai demandé par RTE quand il répond « trop
  de requêtes ».
- Seuls les changements sont envoyés à Gladys, et chaque valeur est renvoyée au moins toutes les
  6 heures pour rester datée.

L'usage des données suit les conditions de RTE : la licence ouverte d'ODRÉ pour éCO2mix, les
conditions générales du portail data.rte-france.com pour EcoWatt.

## Dépannage

- **« EcoWatt refuse l'ID client et l'ID secret »** dans l'écran de configuration : recopiez les
  deux valeurs depuis **Mes applications** sur data.rte-france.com, sans espace, et vérifiez que
  l'application est bien abonnée à l'API **Ecowatt**.
- **« éCO2mix (RTE) ne répond pas »** : le service de RTE est indisponible ou Gladys n'a pas accès à
  internet. L'intégration réessaie seule tous les quarts d'heure.
- **Aucune valeur sur le réseau électrique** : une valeur de plus de trois heures n'est pas envoyée
  (mieux vaut pas de valeur qu'une valeur fausse). Utilisez le bouton **Tester la connexion à
  RTE**.
- **Plus de détails** : les journaux de l'intégration (onglet Supervision) ne montrent que les
  événements utiles. Pour tout voir, ajoutez la variable `LOG_LEVEL=debug`.

## Limites

- France métropolitaine seulement (sans la Corse ni l'outre-mer), comme éCO2mix.
- Les parts par filière sont des pourcentages entiers ; le widget affiche une décimale sous 10 %.
- La consommation s'affiche en kW dans l'appareil : Gladys n'a pas d'unité MW ni GW. Le widget
  l'affiche en GW.
- Le fioul (moins de 1 % de la production) n'a pas de fonctionnalité propre ; il figure dans le
  widget quand il dépasse 0,5 %.
- Le message de RTE transmis aux scènes est en français, tel que RTE le publie.
- EcoWatt ne donne pas le CO₂ prévu : il n'y a pas de prévision du taux de CO₂ dans cette
  intégration.
