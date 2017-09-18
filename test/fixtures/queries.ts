export default [
    {
        aql: 'FOR doc IN collection FILTER doc.status == "active" RETURN doc',
        desc: 'where `status` is equal to "active"',
        data: [
            {
                $limit: 0,
                $skip: 0,
                $where: {
                    $and: [
                        {
                            status: {
                                $eq: 'active'
                            }
                        }
                    ]
                }
            },
            {
                $where: {
                    status: {
                        $eq: 'active'
                    }
                }
            },
            {
                $where: {
                    status: 'active'
                }
            }
        ]
    },
    {
        aql: 'FOR doc IN collection FILTER doc.author.firstName == "John" SORT doc._key, doc.author.firstName DESC RETURN { _key: doc._key, author: doc.author, status: doc.status }',
        desc: 'fields are "id", "test", and "status" where `author.firstName` is equal to "John"',
        data: [
            {
                $fields: ['id', 'author', 'status'],
                $limit: 0,
                $sort: [
                    ['id', 1],
                    ['author.firstName', -1]
                ],
                $skip: 0,
                $where: {
                    $and: [
                        {
                            'author.firstName': {
                                $eq: 'John'
                            }
                        }
                    ]
                }
            },
            {
                $fields: ['id', 'author', 'status'],
                $limit: 0,
                $sort: [
                    ['id', 1],
                    ['author.firstName', -1]
                ],
                $skip: 0,
                $where: {
                    $and: [
                        {
                            author: {
                                firstName: {
                                    $eq: 'John'
                                }
                            }
                        }
                    ]
                }
            },
            {
                $fields: ['id', 'author', 'status'],
                $sort: [
                    ['id', 1],
                    ['author.firstName', -1]
                ],
                $where: {
                    author: {
                        firstName: 'John'
                    }
                }
            }
        ]
    }
];