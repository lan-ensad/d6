import pandas as pd
import os

def debug_csv():
    csv_files = ['csv/contributeurices_int.csv', 'csv/contributeurices_ext.csv']

    for file_path in csv_files:
        print(f"\n=== Debugging {file_path} ===")

        if not os.path.exists(file_path):
            print(f"File {file_path} does not exist!")
            continue

        try:
            # Lire le fichier brut
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()[:10]
                print("Raw lines:")
                for i, line in enumerate(lines):
                    print(f"{i}: {repr(line)}")

            print("\nTrying pandas read_csv with skiprows=1:")
            df = pd.read_csv(file_path, skiprows=1, skipinitialspace=True)
            print(f"Columns: {df.columns.tolist()}")
            print(f"Shape: {df.shape}")
            print("\nFirst few rows:")
            print(df.head())

            # Nettoyer les colonnes et renommer
            df.columns = df.columns.str.strip()
            expected_cols = ['Qui', '', 'Quoi', '', 'Topic', '', 'Plan B']
            if len(df.columns) >= 7:
                new_cols = {}
                for i, col in enumerate(df.columns):
                    if i < len(expected_cols) and expected_cols[i]:
                        new_cols[col] = expected_cols[i]
                df = df.rename(columns=new_cols)
            print(f"\nRenamed columns: {df.columns.tolist()}")

            # Vérifier les colonnes importantes
            if 'Qui' in df.columns:
                valid_rows = df.dropna(subset=['Qui'])
                valid_rows = valid_rows[valid_rows['Qui'].str.strip() != '']
                print(f"Valid 'Qui' rows: {len(valid_rows)}")

                if len(valid_rows) > 0:
                    print("Sample valid data:")
                    for idx, row in valid_rows.head(3).iterrows():
                        print(f"  Qui: {repr(row.get('Qui'))}")
                        print(f"  Quoi: {repr(row.get('Quoi'))}")
                        print(f"  Topic: {repr(row.get('Topic'))}")
                        print()
            else:
                print("'Qui' column not found!")

        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    debug_csv()