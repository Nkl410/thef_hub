Automations that can gain time for the frog : 

- MR do automaticaly
- Add a view for clients spending thru the fidelity programm
- 

---

## Check list de problèmes à regler avec Frog Hub

- Tab 1: System landscape
    - Customer channels
        - Problème de réponse au téléphone —> agent ia réceptioniste pendant les heures de fermeture, voir meme d’ouverture. L’agent peut répondre au téléphone, poser des questions pertinentes, répondre aux questions, booker des réservations (qui doivent etre validées par la suite comme toute résa zenchef), et transférer à un etre humain si besoin ou à la demande du client. L’agent devrait également pouvoir appeler les clients avant leur réservation pour confirmer si ils viennent ou pas (et si ils sont tuojours le meme nombre) et éviter les no shows (l’agent follow up peut etre un agent séparé)
         https://youtu.be/oB7gia1kC_g?si=zfpNAmlcgbS6IBL6
        Connecter l’agent ia receptioniste au frog hub qui lui est connecté aux autres logiciels (recap des appels, informations des clients, création de reservations en attente de validation…) Le but est que l’agent receptionniste soit lié avec l’agent frog hub. 
        Logiciel: Retellai
        —> Il faut qu’on test la solution et qu’on crée un dashboard dans le site pour la réponse au tel par pub. Que chaque manager ait le recap des appels, les transcripts. Il faut aussi le lier à zenchef.
    - Marketing tools
        - Google Analytics 4: Les booking clicks viennent du site (frogpubs.com géré par Define). Problème: Un click n’est pas forcément lié à un  booking et il n’y a pas de moyen de savoir si un client qui a clické “réserver” sur le site a effectivement réservé sur zenchef. Le lien connecte au site zenchef rien de plus. GA4 voit le clic « réserver » ou le clic sur le téléphone, puis le client part sur Zenchef et **on perd sa trace**. La clé de liaison site → Zenchef est en place mais ne remonte rien.
        Des **managers ferment les réservations** quand ils pensent avoir assez de walk-ins : Frog paie de la pub pour envoyer des clients vers une réservation fermée, sans le savoir.
        Des **appels manqués** : le client clique sur le numéro et personne ne répond.
        - Meta ads: Problème: Pas de création automatique de compte sur obypay. Si un lien meta ads obypay peut etre crée ils peuvent instaurer des trucs comme “laisses ton email pour une bière gratuite”
        - Google business proifle (8 comptes différents): Il semble y a voir un problème sur bercy et bordeaux —> 0% de réservations par google alors que les autres pubs c’est 7 à 40%. Les deux pubs ont des ù de réservations via le site du frog élevé —> Les reservations google sont certainement comptées comme des résas site (hypothèse), ils n’ont pas de visibilité sur ce problème
        
    - Pub - Till payment
        - Nepting: Problème: Pas de lien avec Zelty. Les employés tapent leur code dans la machine et font payer les clients. Nepting garde une trace de toutes les transactions par carte (type de cartes aussi) et le code employé qui va avec. Nepting n’est connecté à rien à part les terminaux de paiement. Les managers l’utilisent chaque jour pour avoir les bons chiffres de paiement par carte (ceux de zelty sont faussés). Les GM l’utilisent chaque lundi et les comptables l’utilisent pour split les paiements. Notre but est de lier les infos de paiment de nepting à celles de zelty pour les managers. Il s’agit peut etre d’extraire les données des chaque logiciel et les lier nous memes plutot que de lier les deux logiciels.
        - Zelty: Problème #1: Pas de connection à oby pay hormis le scan du QR code. Ils ont besoin de savoir:
            - Le % de transactions liés a un compte oby pay (club frog) → scans / transactions
            
            Ils veulent le chiffre par: Pub → jour → shift → employé. Ils veulent aussi savoir le manager qui en a le plus donc il faut un lien avec les données de compbo (rotas)
            
            - Situation actuelle: Oby pay a les comptes des clients, les scans et a acces à leurs visites et dépenses via zelty. Zelty a la totalité des transactions.
                
                → Ces chiffres ne sont pas combinés dans un report comme le veut le frog. 
                
                Processus actuel: Aller dans Zelty → conter les transactions du service → aller dans oby pay → inspecter l’activité club frog et les time stamps → réconcilier les deux → calculer le pourcentage etc.
                
                Solution: Comme oby pay peut lier les comptes à des transactions zelty, on peut extraire les données et savoir quel employé est responsable pour chaque scan. On peut egalement savoir quelles transactions sont liées à des scans et lequelles ne le sont pas; et donc avoir la donée nb de scans / transactions. On peut aussi leur sortir des chiffres du genre nombre moyen de clients club frog par addition (vu que plusieurs personnes à une table peuvent scanner leur code)
                
                Emma: Elle doit cross les scans, les ventes et l’emploi du temps des employés pour voir qui est responsable pour quelle transaction
                
                Problème #2: Les informations dans zelty sont à retaper manuellement dans le MR (ventes etc.) voir MR 
                
                Problème #3: Les menus des bières rentrés sur frog space sont à retaper manuellement. Il faudrait extraire les données de frog space et pouvoir faire la modification sur zelty ou connecter les deux logiciels. Ou meme avoir un point d’acces sur notre dashboard frog hub ou le manager peut modifier le menu biere et celui ci sera modifié automatiquement sur zelty et forg space
                
        - OBY Pay:
            - Problème #1: Meilleur lien à établier avec Zelty. (Voir Problème #1:Zelty)
            - Problème #2: Pas de lien avec Zenchef (& booking shake)→ Quelqu’un qui réserve ne devient pas forcément membre. Il faudrait un lien pour qu’un resa zenchef mène à un compte membre. Peut etre envoyer un mail automatique contenant un proposition “devenez membre” apres chaque réservation? Peut etre proposer un truc gratuit si la personne debviernt membre via une réservation? Une création de compte automatique sur oby pay suite à une réservation zenchef nécessiterai un accord du clinet mais si c’est une option envisageable sans ruiner l’ux pourquoi pas.
            - Problème #3: Le frog aimerait faire des campagnes d’ads du gerne “mets ton mail pour une pinte gratuite” mais il n’y a pas de lien Meta ads → Oby pay. En établir un permettrait la création d’un compte directement en provenance de l’ad. (On peut surement faire simple et juste connecter avec un lien)
            - Problème #4: Typeform, les questionnaires pour les clients, n’est pas non plus relié à oby pay. Emma doit manuellement rentrer les résultats des questionnaires dans oby pay. (surement moins important actuellement)
    - Pub - Operations tools
        - Zenchef:
            - Problème #1: Lien manquant avec google analytics → Impossible de savoir si un click sur “réserver” a réelement mené à une réservation sur zenchef.
                
                Solution: Nos devons établir ce lien (par le SDK ou autre) (voir Google analytics dans marketing tools)
                
            - Problème #2: Pas de lien avec SimplyBook/501 → les réservations des darts ne s’affichent pas sur zenchef, mes managers doivent regarder simplybook également.
                
                Solution: Création d’un dashboard réservations sur notre frog hub qui donne l’access à toutes les resas du pub (code couleur pour différencier la nature, précision du nb de personnes, l’heure etc.). Sur ce dashboard les managers devraient pouvoir valider les résas (ce qui validerait sur les autres logiciels). Au minimum on leur donne la visibilié et on inclus des liens vers les autres logiciels si ils veulent aller toucher.
                
            - Problème #3: Lien manquant avec Oby pay, (voir Problème #2 Oby Pay)
        - Yokitup:
            - Problème #1: Pas de lien avec Yooz. Double validation des factures.
                
                Solution: Lier les deux logiciels. Le but est que lorsqu’une facture arrive sur yooz il puisse y avoir un scan pour voir si elle match un bon de livraison sur Yokitup, alerter lorsqu’il y a un écart. Au début on laisse la possibilité aux managers de vérifier. On peut soit lier les deux logiciels si possible soit extraire les données et creer un outil qui compare les données des deux.
                
            - Problème #2: Pas de lien avec Trail. Les employés enregistrent la “casse” en fin de shift. Ce chiffre affect le stock mais n’est pas envoyé à Yoktiup, quelqu’un doit effectuer la modification manuellement, sinon l’inventaire yokitup est faussé.
                
                Solution 1: Automatisation? Extraire les données de trail quotidiennement et moidifier sur yokitup 
                
                Solution 2: Se débarasser de trail. Creer une focntion checklist sur notre logiciel et inclure toute ancienne fonctionalité trail 
                
        - HGEM (cClients mystères, Avis Google/trip advisor):
            - Problème #1: Répond uniquement aux avis Google, obligation de répondre manuellement pour Trip Advisor et Yelp (Yelp très rare)
                
                Solution: Connection aux comptes Trip Advisor et Yelp via l’ia?
                
        - Combo:
            - Problème #1: Pas de connection au MR. Les staffs présents au shift doivent etre rentrés manuellement à chaque MR.
                
                Solution: Extractiond es données Combo et possibilité de créer le MR avec les données pré-remplies
                
            - Problème #2: Export (manuel?) des données vers silae 1x par mois → à vérifier qui fait ca et comment
        - Frogspace:
            - Problème #1: Beer list not linked to Zelty (voir pb zelty)
    - Pub - Excel & Paper
        - Tilrec (fichier excel de reconciliation bancaire):
            - Problème #1: Zelty& Nepting ne sont pas connectés. Les managers passent donc leur temps à comparer les deux pour faire correspondre les chiffes. Pour chaque cashup (chaque staff) il faut comparer ses chiffres Nepting & Zelty
                
                Solution: On extrait les données des deux pour créer des chiffres qui ont du sens (utile pour le MR aussi). On demande avec précision les chiffres qu’ils veulent voir et on les fournit sur un dashboard. (l’ia devrait avoir accès à toutes les donées et pouvoir fournir l’info avec les sources)
                
        - MR (Manager Report Excel):
            - Problème #1: Lien manquant avec Zelty. Chiffres à taper manuellement
            - Problème #2: Pas de lien avec Combo. Infos sur les staff à rentrer manuellement
                
                Solution: “Extract MR” avec les informations préremplies grace aux données des autres logiciels (Zelty, Nepting, Combo…)
                
        - Comptabilité matière:
            - Problème #1: Document crucial, des fois il n’est pas rempli.
                
                Solution: ??
                
    - Head office tools
        - Corportate payment excel (excel partagé avec Tory et les deux comptables):
            - Problème #1: Tory doit courrir après les comptables pour savoir qui a payé ou non.
                
                Solution: Donner à Tory l’accès aux données de confiramtion de paiement (peut etre via l’ia?)
                
    - Accounting tools
        - Yooz:
            - Problème #1: Pas de lien avec Yokitup (voir pb yokitup)
        - Sage:
            - Problème #1: Les données importées de Zelty ne correspondent pas. Ce problème est lié à la classification des méthodes de paiement qui n’est pas effectuée correctement (Zlety n’effectue pas la séparation, ils sont obligés de regarder cote a cote avec nepting)
                
                Solution: Avoir un lien Nepting x zelty avant toute chose pour avoir les données correctes. L’automatisation Zelty-Sage devrait passer par la.
                
            - Problème #2: Les tickets restos sont comptés manuellement, les données sont également rentrées manuellement.
                
                Solution: Outil de scan de tickets resto pour récolter les données (peut etre les mettre dans un dossier tickets restos trié par jour par pub?) pour ensuite les déverser dans Sage. Important d’avoir les comptables qui relisent constement surtout au début mais grosse économie de temps si elles n’ont plus à rentrer les données elles memes.
                
            - Problème #3: Réconciliation bancaire faite dans Sage manuellement.
                
                Solution: à voir ce qui est possible il faudrait qu’on demande les accès et qu’on comprenne ou exactement elles récupèrenet les données et sous quelle forme
                
- Tab 6: Manager Report (MR)
    - Shift Managers
        - Print a report every hour (pour avoir les milestones/onbjectifs par heure):
            - Problème #1: Si la tache est oublié la donnée est perdue. Souvent impossible de collecter les données pendant le rush.
                
                Solution: Créer une automatisation qui extrait les données chaque heure. à voir ou stocker toutes ces données. (les effacer après x jours?)
                
        - Récupértion des ventes classifiées par produit (wet/food/beer):
            - Problème #1: Obligé de le faire manuellement
                
                Solution: Inclure ce transfert de donnée dans l’option “extract MR”. La connection avec zelty doit etre au top pour extraire les bonnes infos
                
        - Récuperation des chiffres Target sur le fichier target budget mensuel
            - Problème #1: Manuel
                
                Solution: Inclure ce transfert de donnée dans l’option “extract MR”. La connection avec zelty doit etre au top pour extraire les bonnes infos
                
        - MR:
            - Problème #1: Tout est manuel comme mentionné plus haut
            
            Solution: Extract MR
            
- Tab 7: Weekly banking, tilrec & payment modes
    - General Manager
        - Remplis la tilrec: Le doc est rempli d’infos qui sont un peu partout, il pourait etre prérempli (paiments en carte nepting, TR etc.).
    - Comptables
        - Séparent les paiements manuellement
        - Content les tickets restos un par un
- Tab 9: Stock, Waste, Inventory & beer duty
    - Jean bernard
        - Reconcilie les bieres produites vs bieres vendues
            
            Problème #1: Les données viennent du fichier comptabilité matière et de zelty. Si tout est mit en commun, on peut lui automatiser la réconciliation dans son pov JB
            
- Tab 12: Club Frog, CRM & Participation KPI
    - Customers
        
        Club Frog members:
        
        - Problème #1: 50,000 contacts mais seulement 9,500 sont liés à un pub. Instaurer un contact automatique des clients non associés à un pub / clients qui ne sont pas venus depuis un moment? → C’est pas notre job en vrai, mais si ils décident de le faire on pourrait aider à automatiser.
        - Problème #2: Oby pay fonctionne par points. Chaque recompense est exprimée en point. L a plateforme ne peut pas donner de récompense sur un déclancheur et ne peut pas compter les visites.
        - Problème #3: Ils veulent un système de comptage de visites pour avoir des trucs du genre “buy 5 get 1 free”
            
            Solution: On peut compter les visites différentes graces aux scans sur zelty. On peut compter les visites par addition. Peut etre rajouter un field qui garde le compte de nb d’additions différentes auxquels un compte à été lié aka nb de visites
            
        - Problème #4: Ils veulent un système de referral → Pas notre taff
        - Problème #5: Ils veulent un système de reconnaissance de carte lors du paiement pour le lier au compte fidélité oby pay de la personne.
            
            Solution: Pas notre taff mais avec les données de Nepting on peut surement extraire les données de paiement et on pourrait faire le lien avec le compte de la personne si oby pay contient les données de paiement des clients. 
            
        - Problème #6: Ils veulent un lien entre simplybook (flechettes) et oby pay pour pouvoir proposer des réductions aux membres. Ils ont parlé de coder un lien entre les deux systèmes? Jsp si c’est possible
        - Problème #7: Ils veulent proposer club frog lorsque quelqu’un réserve
        - Problème #8: Le staff ne recoit plus de crédits ( ils doivent avoir tout moitié prix et pintes a 3€ il me semble)
            
            Solution: Créer un type de compte dans oby pay et le lier aux staff? Ou alors lier avec Combo pour savoir qui est staff et leur attribuer un compte avec des crédits?
            
    - Emma
        
        Reporting club frog pour les gm chaque lundi
        
        - Problème #1: Les données sont compliquées à aller chercher, elle aimerait que chaque GM ait déja les données automatiquement.
            
            Solution: Création d’un reporting “Club frog” pour chaque pub qui combine les données Oby Pay & Zelty pour leurs montrer les chiffres liés à la fidélité dans leur pub. Il faudrait une vure globale pour Emma Paul etc. Il faudrait aussi des filtres jour/semaine/mois… 
            
        - Problème #2: Les compétitions entre manager du % de trnasactions liés à oby pay. Emma passe 4h a tatoner pour lier les transactions aux managers
            
            Solution: Meme solution, combinée aux données de combo pour lier les chiffres de fidélité mais aux managers qui étaient présents lors du shift
            
- Tab 13: Marketing, website booking & attribution
    - Problème #1: Il faut vérifier tous les liens à Zenchef
    - Problème #2: Il faut une alerte lorsque les réservations sont fermées sur Zenchef. Cela doit s’afficher dans le hub pour toutes les personnes concernées (liz, paul…)
- Tab 18: Head office, finance
    - Jean Bernard
        
        Dashboard pour Paul (staff cost, capex, marketing):
        
        - P