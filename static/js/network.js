class NetworkVisualization {
    constructor() {
        this.svg = d3.select('#network');
        this.container = this.svg.append('g');

        this.width = 1200;
        this.height = 700;
        this.svg.attr('width', this.width).attr('height', this.height);

        console.log('SVG initialized with dimensions:', this.width, 'x', this.height);

        // Zoom et pan
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.container.attr('transform', event.transform);
            });

        this.svg.call(this.zoom);

        this.colorScale = d3.scaleOrdinal(d3.schemeSet3);
        this.data = null;
        this.filteredData = null;
        this.currentFilters = {
            quoi: 'all',
            topic: 'all',
            source: 'all'
        };

        // Nouveau système de filtres actifs
        this.activeFilters = {
            source: new Set(['internal', 'external']),
            quoi: new Set()
        };

        this.showLabels = true;
        this.simulation = null;

        this.loadData();
        this.setupLegendClickHandlers();
    }

    setupLegendClickHandlers() {
        // Gestionnaires pour les filtres source
        document.addEventListener('click', (event) => {
            if (event.target.closest('.legend-filter[data-filter="source"]')) {
                const element = event.target.closest('.legend-filter');
                const value = element.getAttribute('data-value');
                this.toggleSourceFilter(value);
            }

            // Gestionnaires pour les filtres quoi (ajoutés dynamiquement)
            if (event.target.closest('.legend-filter[data-filter="quoi"]')) {
                const element = event.target.closest('.legend-filter');
                const value = element.getAttribute('data-value');
                this.toggleQuoiFilter(value);
            }
        });
    }

    toggleSourceFilter(source) {
        const legendItem = document.querySelector(`[data-filter="source"][data-value="${source}"]`);

        if (this.activeFilters.source.has(source)) {
            this.activeFilters.source.delete(source);
            legendItem.classList.remove('active');
        } else {
            this.activeFilters.source.add(source);
            legendItem.classList.add('active');
        }

        this.applyActiveFilters();
    }

    toggleQuoiFilter(type) {
        const legendItem = document.querySelector(`[data-filter="quoi"][data-value="${type}"]`);

        if (this.activeFilters.quoi.has(type)) {
            this.activeFilters.quoi.delete(type);
            legendItem.classList.remove('active');
        } else {
            this.activeFilters.quoi.add(type);
            legendItem.classList.add('active');
        }

        this.applyActiveFilters();
    }

    async loadData() {
        try {
            this.showLoading();
            const response = await fetch('/api/network-data');
            this.data = await response.json();

            this.setupFilters();
            this.setupLegend();

            console.log('Initial data loaded:', this.data.nodes.length, 'nodes,', this.data.links.length, 'links');

            // Forcer l'affichage immédiat avec toutes les données
            this.filteredData = {
                nodes: this.data.nodes.slice(),
                links: this.data.links.slice()
            };

            console.log('About to call updateVisualization with', this.filteredData.nodes.length, 'nodes');

            // Attendre que le DOM soit prêt et forcer l'affichage
            requestAnimationFrame(() => {
                this.updateVisualization();
                // Double appel pour s'assurer que tout est bien initialisé
                setTimeout(() => {
                    if (this.container.selectAll('.node-group').empty()) {
                        console.log('No elements found, retrying...');
                        this.updateVisualization();
                    }
                }, 100);
                this.hideLoading();
            });
        } catch (error) {
            console.error('Erreur lors du chargement des données:', error);
            this.showError('Erreur lors du chargement des données');
        }
    }

    showLoading() {
        this.svg.selectAll('*').remove();
        this.svg.append('text')
            .attr('x', this.width / 2)
            .attr('y', this.height / 2)
            .attr('text-anchor', 'middle')
            .attr('class', 'loading')
            .text('Chargement des données...');
    }

    hideLoading() {
        this.svg.selectAll('.loading').remove();
        this.container = this.svg.append('g');
    }

    showError(message) {
        this.svg.selectAll('*').remove();
        this.svg.append('text')
            .attr('x', this.width / 2)
            .attr('y', this.height / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', '#e74c3c')
            .text(message);
    }

    setupFilters() {
        // Extraire tous les types "Quoi" et créer des sets pour éviter les doublons
        const allQuoiTypes = this.data.nodes
            .filter(n => n.type === 'contributor' && n.quoi)
            .map(n => n.quoi);

        // Séparer les types qui contiennent des virgules et créer un set unique
        const uniqueQuoiTypes = new Set();
        allQuoiTypes.forEach(quoiString => {
            if (quoiString.includes(',')) {
                // Diviser par virgule et ajouter chaque type individuellement
                quoiString.split(',').forEach(type => {
                    uniqueQuoiTypes.add(type.trim());
                });
            } else {
                uniqueQuoiTypes.add(quoiString.trim());
            }
        });

        // Convertir en tableau trié
        const quoiTypesArray = Array.from(uniqueQuoiTypes).sort();

        // Initialiser tous les types comme actifs
        this.activeFilters.quoi = new Set(quoiTypesArray);

        // Créer la légende cliquable pour les types Quoi
        const legendContainer = d3.select('#legend-quoi');
        legendContainer.selectAll('*').remove();

        quoiTypesArray.forEach(type => {
            const item = legendContainer.append('div')
                .attr('class', 'legend-item legend-filter active')
                .attr('data-filter', 'quoi')
                .attr('data-value', type);

            item.append('span')
                .attr('class', 'legend-color')
                .style('background-color', this.colorScale(type));

            item.append('span')
                .text(type);
        });

        // Créer les filtres par Topic
        this.setupTopicFilters();
    }

    setupTopicFilters() {
        // Extraire tous les topics et créer des sets pour éviter les doublons
        const allTopics = this.data.nodes
            .filter(n => n.type === 'contributor' && n.topic)
            .map(n => n.topic);

        // Séparer les topics qui contiennent des virgules et créer un set unique
        const uniqueTopics = new Set();
        allTopics.forEach(topicString => {
            if (topicString.includes(',')) {
                // Diviser par virgule et ajouter chaque topic individuellement
                topicString.split(',').forEach(topic => {
                    uniqueTopics.add(topic.trim());
                });
            } else {
                uniqueTopics.add(topicString.trim());
            }
        });

        // Convertir en tableau trié
        const topicsArray = Array.from(uniqueTopics).sort();

        const topicSelect = d3.select('#topic-select');

        // Supprimer les options existantes (sauf "Tous topics")
        topicSelect.selectAll('option:not([value="all"])').remove();

        // Ajouter les options pour chaque topic
        topicsArray.forEach(topic => {
            topicSelect.append('option')
                .attr('value', topic)
                .text(topic);
        });
    }

    setupLegend() {
        // Extraire tous les types "Quoi" et créer des sets pour éviter les doublons
        const allQuoiTypes = this.data.nodes
            .filter(n => n.type === 'contributor' && n.quoi)
            .map(n => n.quoi);

        // Séparer les types qui contiennent des virgules et créer un set unique
        const uniqueQuoiTypes = new Set();
        allQuoiTypes.forEach(quoiString => {
            if (quoiString.includes(',')) {
                // Diviser par virgule et ajouter chaque type individuellement
                quoiString.split(',').forEach(type => {
                    uniqueQuoiTypes.add(type.trim());
                });
            } else {
                uniqueQuoiTypes.add(quoiString.trim());
            }
        });

        // Convertir en tableau trié
        const quoiTypesArray = Array.from(uniqueQuoiTypes).sort();

        console.log('Unique Quoi types:', quoiTypesArray);

        const legendContainer = d3.select('#legend-colors');
        legendContainer.selectAll('*').remove();

        // Organiser en colonnes/tableaux pour un meilleur affichage
        const itemsPerRow = 4;
        let currentRow = null;

        quoiTypesArray.forEach((type, index) => {
            // Créer une nouvelle ligne tous les 4 éléments
            if (index % itemsPerRow === 0) {
                currentRow = legendContainer.append('div')
                    .attr('class', 'legend-row');
            }

            const item = currentRow.append('div')
                .attr('class', 'legend-item');

            item.append('span')
                .attr('class', 'legend-color')
                .style('background-color', this.colorScale(type));

            item.append('span')
                .text(type);
        });
    }

    filterByQuoi(type) {
        console.log('Filtering by Quoi:', type);
        this.currentFilters.quoi = type;
        this.updateActiveButton('#quoi-filters', type);
        this.filterAndUpdate();
    }

    filterByTopic(topic) {
        console.log('Filtering by Topic:', topic);
        this.currentFilters.topic = topic;
        // Mettre à jour la liste déroulante
        d3.select('#topic-select').property('value', topic);
        this.filterAndUpdate();
    }

    filterBySource(source) {
        this.currentFilters.source = source;
        this.updateActiveButton('[onclick*="filterBySource"]', source);
        this.filterAndUpdate();
    }

    updateActiveButton(selector, activeValue) {
        // Pour les filtres de source, utiliser un sélecteur spécifique
        if (selector.includes('filterBySource')) {
            d3.selectAll('button[onclick*="filterBySource"]').classed('active', false);

            if (activeValue === 'all') {
                d3.select('button[onclick="filterBySource(\'all\')"]').classed('active', true);
            } else if (activeValue === 'internal') {
                d3.select('button[onclick="filterBySource(\'internal\')"]').classed('active', true);
            } else if (activeValue === 'external') {
                d3.select('button[onclick="filterBySource(\'external\')"]').classed('active', true);
            }
        } else {
            // Pour les filtres quoi - inclure aussi le bouton "Tout afficher" du parent
            if (selector === '#quoi-filters') {
                // Désactiver tous les boutons du container ET le bouton "Tout afficher"
                d3.selectAll('#quoi-filters .filter-btn').classed('active', false);
                d3.selectAll('button[onclick="filterByQuoi(\'all\')"]').classed('active', false);

                if (activeValue === 'all') {
                    d3.selectAll('button[onclick="filterByQuoi(\'all\')"]').classed('active', true);
                } else {
                    d3.selectAll('#quoi-filters .filter-btn')
                        .filter(function() {
                            return d3.select(this).text() === activeValue;
                        })
                        .classed('active', true);
                }
            } else {
                // Pour les autres filtres (comportement normal)
                d3.selectAll(`${selector} .filter-btn`).classed('active', false);

                if (activeValue === 'all') {
                    d3.select(`${selector} .filter-btn`).classed('active', true);
                } else {
                    d3.selectAll(`${selector} .filter-btn`)
                        .filter(function() {
                            return d3.select(this).text() === activeValue;
                        })
                        .classed('active', true);
                }
            }
        }
    }

    applyActiveFilters() {
        if (!this.data) return;

        let allTopics = this.data.nodes.filter(n => n.type === 'topic');
        let filteredContributors = this.data.nodes.filter(n => n.type === 'contributor');

        // Filtrer par source
        filteredContributors = filteredContributors.filter(n => {
            return this.activeFilters.source.has(n.source);
        });

        // Filtrer par type (Quoi)
        if (this.activeFilters.quoi.size > 0) {
            filteredContributors = filteredContributors.filter(n => {
                if (!n.quoi) return false;
                const quoiTypes = n.quoi.split(',').map(type => type.trim());
                return quoiTypes.some(type => this.activeFilters.quoi.has(type));
            });
        }

        // Filtrer les topics pour ne garder que ceux connectés aux contributeurs filtrés
        const contributorIds = filteredContributors.map(n => n.id);

        // Trouver les topics connectés
        const connectedTopicIds = new Set();
        this.data.links.forEach(l => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            if (contributorIds.includes(sourceId)) {
                const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                connectedTopicIds.add(targetId);
            }
        });

        const filteredTopics = allTopics.filter(t => connectedTopicIds.has(t.id));

        // Filtrer les liens
        const filteredLinks = this.data.links.filter(l => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;

            const sourceMatch = contributorIds.includes(sourceId);
            const targetMatch = connectedTopicIds.has(targetId);

            return sourceMatch && targetMatch;
        });

        // Combiner les contributeurs filtrés avec les topics connectés
        const filteredNodes = [...filteredContributors, ...filteredTopics];

        this.filteredData = {
            nodes: filteredNodes,
            links: filteredLinks
        };

        console.log(`Filtered: ${filteredContributors.length} contributors, ${filteredTopics.length} topics, ${filteredLinks.length} links`);
        this.updateVisualization();
    }

    filterAndUpdate() {
        // Maintenir la compatibilité avec l'ancien système
        this.applyActiveFilters();
    }

    updateVisualization() {
        console.log('updateVisualization called with', this.filteredData ? this.filteredData.nodes.length : 'no', 'nodes');
        if (!this.filteredData) {
            console.log('No filtered data, returning');
            return;
        }

        // Supprimer les éléments existants
        this.container.selectAll('.link').remove();
        this.container.selectAll('.node-group').remove();
        this.container.selectAll('.node').remove();
        this.container.selectAll('.label-group').remove();

        if (this.simulation) {
            this.simulation.stop();
        }

        // Créer la simulation avec des forces plus compactes
        console.log('Creating simulation with', this.filteredData.nodes.length, 'nodes and', this.filteredData.links.length, 'links');
        this.simulation = d3.forceSimulation(this.filteredData.nodes)
            .force('link', d3.forceLink(this.filteredData.links)
                .id(d => d.id)
                .distance(d => d.source.type === 'contributor' ? 50 : 40) // Réduit de 80/60 à 50/40
                .strength(0.8)) // Ajout d'une force de lien plus forte
            .force('charge', d3.forceManyBody()
                .strength(d => d.type === 'contributor' ? -200 : -100)) // Réduit de -400/-200 à -200/-100
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide()
                .radius(d => d.type === 'contributor' ? 18 : 12)) // Ajusté pour les nouvelles tailles
            .force('x', d3.forceX(this.width / 2).strength(0.05)) // Force vers le centre X
            .force('y', d3.forceY(this.height / 2).strength(0.05)); // Force vers le centre Y

        // Créer les liens
        const links = this.container.selectAll('.link')
            .data(this.filteredData.links)
            .enter()
            .append('line')
            .attr('class', 'link')
            .on('mouseover', (event, d) => this.highlightConnection(d))
            .on('mouseout', () => this.clearHighlight());

        // Créer les nœuds avec des formes différentes selon la source
        const nodeGroups = this.container.selectAll('.node-group')
            .data(this.filteredData.nodes)
            .enter()
            .append('g')
            .attr('class', d => `node-group ${d.type}`)
            .on('mouseover', (event, d) => this.showNodeInfo(d))
            .on('mouseout', () => this.clearHighlight())
            .on('click', (event, d) => this.focusOnNode(d))
            .call(d3.drag()
                .on('start', (event, d) => this.dragStarted(event, d))
                .on('drag', (event, d) => this.dragged(event, d))
                .on('end', (event, d) => this.dragEnded(event, d)));

        // Ajouter les formes selon la source et le type
        nodeGroups.each(function(d) {
            const group = d3.select(this);
            const contributorSize = 12; // Augmenté de 8 à 12
            const topicSize = 8; // Augmenté de 6 à 8
            const size = d.type === 'contributor' ? contributorSize : topicSize;

            // Pour les contributeurs, utiliser le premier type pour la couleur
            let color = '#95a5a6'; // Couleur par défaut
            if (d.type === 'contributor' && d.quoi) {
                const firstType = d.quoi.split(',')[0].trim();
                color = window.networkViz.colorScale(firstType);
            }

            if (d.type === 'topic') {
                // Topics sont des losanges (diamants)
                const diamondPath = `M 0,-${size} L ${size},0 L 0,${size} L -${size},0 Z`;
                group.append('path')
                    .attr('class', 'node topic')
                    .attr('d', diamondPath)
                    .style('fill', color)
                    .style('opacity', 0.8);
            } else {
                // Contributeurs : cercle pour internal, carré pour external
                if (d.source === 'internal') {
                    group.append('circle')
                        .attr('class', 'node contributor internal')
                        .attr('r', size)
                        .style('fill', color)
                        .style('opacity', 0.8);
                } else {
                    const squareSize = size * 0.95; // Réduire de 5%
                    group.append('rect')
                        .attr('class', 'node contributor external')
                        .attr('width', squareSize * 2)
                        .attr('height', squareSize * 2)
                        .attr('x', -squareSize)
                        .attr('y', -squareSize)
                        .style('fill', color)
                        .style('opacity', 0.8);
                }
            }
        });

        // Créer les labels avec gestion du retour à la ligne
        if (this.showLabels) {
            const labelGroups = this.container.selectAll('.label-group')
                .data(this.filteredData.nodes)
                .enter()
                .append('g')
                .attr('class', 'label-group');

            labelGroups.each(function(d) {
                const group = d3.select(this);
                const maxCharsPerLine = 15; // Nombre max de caractères par ligne
                const name = d.name;

                // Diviser le nom en mots
                const words = name.split(' ');
                let lines = [];
                let currentLine = '';

                // Construire les lignes en respectant la limite de caractères
                words.forEach(word => {
                    if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
                        currentLine = currentLine ? currentLine + ' ' + word : word;
                    } else {
                        if (currentLine) {
                            lines.push(currentLine);
                            currentLine = word;
                        } else {
                            // Le mot est trop long pour une ligne, le couper
                            lines.push(word.substring(0, maxCharsPerLine));
                            currentLine = word.substring(maxCharsPerLine);
                        }
                    }
                });

                if (currentLine) {
                    lines.push(currentLine);
                }

                // Limiter à 2 lignes maximum
                if (lines.length > 2) {
                    lines = lines.slice(0, 2);
                    lines[1] = lines[1].substring(0, 12) + '...';
                }

                // Créer un texte pour chaque ligne
                const baseY = d.type === 'contributor' ? 25 : 20;
                const lineHeight = 12;

                lines.forEach((line, i) => {
                    group.append('text')
                        .attr('class', d => `node-label ${d.type}-label`)
                        .text(line)
                        .attr('dy', baseY + (i * lineHeight))
                        .attr('text-anchor', 'middle');
                });
            });
        }

        console.log('Created', nodeGroups.size(), 'node groups and', links.size(), 'links');

        // Vérifier que les éléments sont bien dans le DOM
        console.log('Node groups in DOM:', this.container.selectAll('.node-group').size());
        console.log('Links in DOM:', this.container.selectAll('.link').size());

        // Animation de la simulation
        this.simulation.on('tick', () => {
            links
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            this.container.selectAll('.node-group')
                .attr('transform', d => `translate(${d.x}, ${d.y})`);

            if (this.showLabels) {
                this.container.selectAll('.label-group')
                    .attr('transform', d => `translate(${d.x}, ${d.y})`);
            }
        });

        // Forcer le démarrage de la simulation
        this.simulation.alpha(1).restart();
        console.log('Simulation restarted');

        // Log initial pour vérifier que les éléments ont des positions
        setTimeout(() => {
            console.log('Sample node positions:', this.filteredData.nodes.slice(0, 3).map(n => ({id: n.id, x: n.x, y: n.y})));
        }, 1000);

        this.updateStats();
    }

    showNodeInfo(node) {
        const infoContent = d3.select('#info-content');

        if (node.type === 'contributor') {
            infoContent.html(`
                <strong>${node.name}</strong><br>
                <strong>Type:</strong> ${node.quoi || 'Non spécifié'}<br>
                <strong>Topics:</strong> ${node.topic || 'Non spécifié'}<br>
                <strong>Source:</strong> ${node.source === 'internal' ? 'Interne' : 'Externe'}
            `);
        } else {
            const connections = this.filteredData.links
                .filter(l => l.target === node.id || l.target.id === node.id)
                .length;

            infoContent.html(`
                <strong>Topic: ${node.name}</strong><br>
                <strong>Connexions:</strong> ${connections} contributeur${connections > 1 ? 's' : ''}
            `);
        }

        this.highlightNode(node);
    }

    highlightNode(node) {
        // Réinitialiser
        this.container.selectAll('.node-group').classed('highlighted', false);
        this.container.selectAll('.node').classed('highlighted', false);
        this.container.selectAll('.link').classed('highlighted', false);

        // Mettre en évidence le nœud
        this.container.selectAll('.node-group')
            .filter(d => d.id === node.id)
            .classed('highlighted', true);

        this.container.selectAll('.node')
            .filter(function() {
                return d3.select(this.parentNode).datum().id === node.id;
            })
            .classed('highlighted', true);

        // Mettre en évidence les connexions
        this.container.selectAll('.link')
            .filter(d => d.source.id === node.id || d.target.id === node.id)
            .classed('highlighted', true);
    }

    highlightConnection(link) {
        this.container.selectAll('.link').classed('highlighted', false);
        this.container.selectAll('.node-group').classed('highlighted', false);
        this.container.selectAll('.node').classed('highlighted', false);

        // Mettre en évidence le lien
        this.container.selectAll('.link')
            .filter(d => d === link)
            .classed('highlighted', true);

        // Mettre en évidence les nœuds connectés
        this.container.selectAll('.node-group')
            .filter(d => d.id === link.source.id || d.id === link.target.id)
            .classed('highlighted', true);

        this.container.selectAll('.node')
            .filter(function() {
                const nodeData = d3.select(this.parentNode).datum();
                return nodeData.id === link.source.id || nodeData.id === link.target.id;
            })
            .classed('highlighted', true);
    }

    clearHighlight() {
        this.container.selectAll('.highlighted').classed('highlighted', false);
    }

    focusOnNode(node) {
        const transform = d3.zoomIdentity
            .translate(this.width / 2 - node.x, this.height / 2 - node.y)
            .scale(1.5);

        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    }

    resetPositions() {
        if (this.simulation) {
            this.simulation.alpha(1).restart();
        }

        // Réinitialiser le zoom
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, d3.zoomIdentity);
    }

    toggleLabels() {
        this.showLabels = !this.showLabels;

        if (this.showLabels) {
            // Recréer tous les labels
            this.updateVisualization();
        } else {
            // Masquer les labels existants
            this.container.selectAll('.label-group')
                .transition()
                .duration(300)
                .style('opacity', 0);
        }
    }

    updateStats() {
        const stats = {
            contributors: this.filteredData.nodes.filter(n => n.type === 'contributor').length,
            topics: this.filteredData.nodes.filter(n => n.type === 'topic').length,
            connections: this.filteredData.links.length
        };

        console.log('Stats:', stats);
    }

    dragStarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragEnded(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
}

// Fonctions globales pour les boutons
function filterByQuoi(type) {
    if (window.networkViz) {
        window.networkViz.filterByQuoi(type);
    }
}

function filterByTopic(topic) {
    if (window.networkViz) {
        window.networkViz.filterByTopic(topic);
    }
}

function filterBySource(source) {
    if (window.networkViz) {
        window.networkViz.filterBySource(source);
    }
}

function resetPositions() {
    if (window.networkViz) {
        window.networkViz.resetPositions();
    }
}

function toggleLabels() {
    if (window.networkViz) {
        window.networkViz.toggleLabels();
    }
}

// Initialiser la visualisation quand la page est chargée
document.addEventListener('DOMContentLoaded', function() {
    window.networkViz = new NetworkVisualization();
});