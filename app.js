fetch('contributions.json')
    .then(response => response.json())
    .then(data => {
        const nodes = [];
        const links = [];
        const topicSet = new Set();
        const personSet = new Set();
        const personData = new Map();
        const topicData = new Map();

        let isPinned = false;

        data.forEach(contribution => {
            const personnes = Array.isArray(contribution.qui) ? contribution.qui : [contribution.qui];

            personnes.forEach(p => {
                if (!personSet.has(p.nom)) {
                    personSet.add(p.nom);
                    nodes.push({ id: p.nom, type: 'person', rattachement: p.rattachement, contact: p.contact });
                    personData.set(p.nom, {
                        rattachement: p.rattachement,
                        contact: p.contact,
                        topics: [],
                        quoi: contribution.quoi
                    });
                }
                contribution.topic.forEach(t => {
                    if (!personData.get(p.nom).topics.includes(t)) {
                        personData.get(p.nom).topics.push(t);
                    }
                });
            });

            contribution.topic.forEach(t => {
                if (!topicSet.has(t)) {
                    topicSet.add(t);
                    nodes.push({ id: t, type: 'topic' });
                    topicData.set(t, { personnes: [] });
                }
                personnes.forEach(p => {
                    links.push({ source: p.nom, target: t });
                    if (!topicData.get(t).personnes.find(x => x.nom === p.nom)) {
                        topicData.get(t).personnes.push({ nom: p.nom, contact: p.contact });
                    }
                });
            });
        });

        const width = window.innerWidth;
        const height = window.innerHeight;
        const margin = 50;

        const svg = d3.select('svg')
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g');

        const zoom = d3.zoom()
            .scaleExtent([0.3, 3])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(40))
            .force('x', d3.forceX(width / 2).strength(0.05))
            .force('y', d3.forceY(height / 2).strength(0.05));

        const link = g.append('g')
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('class', 'link');

        const node = g.append('g')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .attr('class', d => `node-${d.type}`)
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended))
            .on('mouseenter', (event, d) => showInfo(d, false))
            .on('mouseleave', hideInfoIfNotPinned)
            .on('click', (event, d) => {
                event.stopPropagation();
                showInfo(d, true);
            });

        node.append('circle')
            .attr('r', d => d.type === 'person' ? 8 : 6);

        node.append('text')
            .attr('class', 'label')
            .attr('dx', 12)
            .attr('dy', 4)
            .text(d => d.id);

        simulation.on('tick', () => {
            nodes.forEach(d => {
                d.x = Math.max(margin, Math.min(width - margin, d.x));
                d.y = Math.max(margin, Math.min(height - margin, d.y));
            });

            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

        function showInfo(d, pin) {
            const info = document.getElementById('info');
            const content = document.getElementById('info-content');

            if (pin) {
                isPinned = true;
                info.classList.add('pinned');
            }

            let html = '';

            if (d.type === 'person') {
                const p = personData.get(d.id);
                html = `
                    <span class="type-badge type-person">Personne</span>
                    <h3>${d.id}</h3>
                    <p><strong>Rattachement:</strong> ${p.rattachement}</p>
                    <p><strong>Contact:</strong> <a href="mailto:${p.contact}">${p.contact}</a></p>
                    <p><strong>Topics:</strong></p>
                    <ul>${p.topics.map(t => `<li>${t}</li>`).join('')}</ul>
                    <p><strong>Contribution:</strong></p>
                    <ul>
                        <li>Papier: ${p.quoi.papier}</li>
                        <li>Web: ${p.quoi.web}</li>
                    </ul>
                `;
            } else {
                const t = topicData.get(d.id);
                html = `
                    <span class="type-badge type-topic">Topic</span>
                    <h3>${d.id}</h3>
                    <p><strong>Contributeur·ices:</strong></p>
                    <ul>${t.personnes.map(p => `<li>${p.nom}<br><a href="mailto:${p.contact}">${p.contact}</a></li>`).join('')}</ul>
                `;
            }

            content.innerHTML = html;
            info.style.display = 'block';
        }

        function hideInfoIfNotPinned() {
            if (!isPinned) {
                document.getElementById('info').style.display = 'none';
            }
        }

        document.querySelector('#info .close').addEventListener('click', () => {
            const info = document.getElementById('info');
            info.style.display = 'none';
            info.classList.remove('pinned');
            isPinned = false;
        });

        svg.on('click', () => {
            const info = document.getElementById('info');
            info.style.display = 'none';
            info.classList.remove('pinned');
            isPinned = false;
        });
    });
