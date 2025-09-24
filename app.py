from flask import Flask, render_template, jsonify
import pandas as pd
import os

app = Flask(__name__)

def read_csv_data():
    csv_dir = 'csv'
    data = {'internal': [], 'external': []}

    try:
        # Lire contributeurices_int.csv
        if os.path.exists(os.path.join(csv_dir, 'contributeurices_int.csv')):
            # Lire en sautant la première ligne et en prenant la ligne 1 comme header
            df_int = pd.read_csv(os.path.join(csv_dir, 'contributeurices_int.csv'),
                               skiprows=1, skipinitialspace=True)
            # Nettoyer les noms de colonnes (enlever les colonnes vides)
            df_int.columns = df_int.columns.str.strip()
            # Garder seulement les colonnes utiles (1, 3, 5 correspondent à Qui, Quoi, Topic)
            useful_cols = []
            col_names = ['Qui', 'Quoi', 'Topic']
            col_indices = [1, 3, 5]  # Qui, Quoi, Topic

            for i, new_name in zip(col_indices, col_names):
                if i < len(df_int.columns):
                    useful_cols.append((df_int.columns[i], new_name))

            # Créer un nouveau DataFrame avec seulement les colonnes utiles
            df_clean = pd.DataFrame()
            for old_name, new_name in useful_cols:
                df_clean[new_name] = df_int[old_name]
            df_int = df_clean

            # Filtrer les lignes avec des données valides
            if 'Qui' in df_int.columns:
                df_int = df_int.dropna(subset=['Qui'])
                df_int = df_int[df_int['Qui'].astype(str).str.strip() != '']
                # Nettoyer les données
                for col in ['Qui', 'Quoi', 'Topic']:
                    if col in df_int.columns:
                        df_int[col] = df_int[col].astype(str).str.strip()
                data['internal'] = df_int.to_dict('records')

        # Lire contributeurices_ext.csv
        if os.path.exists(os.path.join(csv_dir, 'contributeurices_ext.csv')):
            # Lire en sautant la première ligne et en prenant la ligne 1 comme header
            df_ext = pd.read_csv(os.path.join(csv_dir, 'contributeurices_ext.csv'),
                               skiprows=1, skipinitialspace=True)
            # Nettoyer les noms de colonnes
            df_ext.columns = df_ext.columns.str.strip()
            # Garder seulement les colonnes utiles (1, 3, 5 correspondent à Qui, Quoi, Topic)
            useful_cols = []
            col_names = ['Qui', 'Quoi', 'Topic']
            col_indices = [1, 3, 5]  # Qui, Quoi, Topic

            for i, new_name in zip(col_indices, col_names):
                if i < len(df_ext.columns):
                    useful_cols.append((df_ext.columns[i], new_name))

            # Créer un nouveau DataFrame avec seulement les colonnes utiles
            df_clean = pd.DataFrame()
            for old_name, new_name in useful_cols:
                df_clean[new_name] = df_ext[old_name]
            df_ext = df_clean

            # Filtrer les lignes avec des données valides
            if 'Qui' in df_ext.columns:
                df_ext = df_ext.dropna(subset=['Qui'])
                df_ext = df_ext[df_ext['Qui'].astype(str).str.strip() != '']
                # Nettoyer les données
                for col in ['Qui', 'Quoi', 'Topic']:
                    if col in df_ext.columns:
                        df_ext[col] = df_ext[col].astype(str).str.strip()
                data['external'] = df_ext.to_dict('records')

    except Exception as e:
        print(f"Erreur lors de la lecture des CSV: {e}")
        import traceback
        traceback.print_exc()

    return data

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data')
def get_data():
    data = read_csv_data()
    return jsonify(data)

@app.route('/api/network-data')
def get_network_data():
    data = read_csv_data()

    nodes = []
    links = []
    node_id = 0
    topic_nodes = {}

    # Traiter les données internes et externes
    for source_type, records in data.items():
        for record in records:
            if not record.get('Qui') or record.get('Qui', '').strip() == '' or str(record.get('Qui')).lower() == 'nan':
                continue

            # Créer le nœud contributeur
            contributor_node = {
                'id': f"contributor_{node_id}",
                'name': record.get('Qui', ''),
                'type': 'contributor',
                'quoi': record.get('Quoi', ''),
                'topic': record.get('Topic', ''),
                'source': source_type,
                'group': hash(record.get('Quoi', '')) % 10
            }
            nodes.append(contributor_node)

            # Traiter les topics
            topics_str = record.get('Topic', '')
            if topics_str and str(topics_str).lower() != 'nan' and topics_str.strip():
                topics = [t.strip() for t in str(topics_str).split(',') if t.strip()]

                for topic in topics:
                    topic_key = topic.lower()

                    # Créer le nœud topic s'il n'existe pas
                    if topic_key not in topic_nodes:
                        topic_node_id = f"topic_{len(topic_nodes)}"
                        topic_node = {
                            'id': topic_node_id,
                            'name': topic,
                            'type': 'topic',
                            'group': len(topic_nodes) % 5 + 10
                        }
                        nodes.append(topic_node)
                        topic_nodes[topic_key] = topic_node_id

                    # Créer le lien contributeur -> topic
                    links.append({
                        'source': contributor_node['id'],
                        'target': topic_nodes[topic_key],
                        'quoi': record.get('Quoi', ''),
                        'strength': 1
                    })

            node_id += 1

    return jsonify({'nodes': nodes, 'links': links})

if __name__ == '__main__':
    app.run(debug=True)