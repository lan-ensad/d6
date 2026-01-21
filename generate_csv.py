import json
import csv

with open('contributions.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

with open('contributions.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['Nom', 'Contact', 'Papier', 'Web'])

    for contribution in data:
        qui = contribution['qui']

        if isinstance(qui, list):
            noms = ', '.join(p['nom'] for p in qui)
            contacts = ', '.join(p['contact'] for p in qui)
        else:
            noms = qui['nom']
            contacts = qui['contact']

        papier = contribution['typologie']['papier']
        web = contribution['typologie']['web']

        writer.writerow([noms, contacts, papier, web])

print('contributions.csv généré avec succès')
